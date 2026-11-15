// =============================================================================
//  Past sessions from a spreadsheet
//  ---------------------------------------------------------------------------
//  A cafe that ran for years before the hub can add those years from a CSV
//  file, so its totals, charts and "first session" date show its real age.
//  The browser reads and checks the file (packages/shared/src/history.ts) and
//  sends the rows here in small chunks:
//
//    GET    /api/admin/history/context          what the browser checks against
//    POST   /api/admin/history/imports          start an import, get its id
//    POST   /api/admin/history/imports/:id/rows one chunk, written in one batch
//    POST   /api/admin/history/imports/:id/finish
//    GET    /api/admin/history/imports          earlier imports
//    DELETE /api/admin/history/imports/:id      remove everything one import added
//
//  Imported sessions and repairs are ordinary rows, so every figure counts them
//  with no special cases. They carry the import's id in `import_id`, which is
//  how an import is listed and removed. They hold no visitor details, so there
//  is nothing for the GDPR clean-up to do.
//
//  Each chunk is one D1 batch, which is one transaction: a chunk is saved in
//  full or not at all. A chunk sent twice (a retry after a dropped connection)
//  is noticed through a marker in hub_meta and skipped.
//
//  Also here: volunteers whose first recorded repair is before the date they
//  joined, so an admin can move the joined date back in one step.
// =============================================================================
import type { App, HubReply, HubRequest } from '../../lib/router.js';
import { bindings } from '../../env.js';
import { localToday } from '../../lib/dates.js';
import { audit } from '../../utils/audit.js';
import { matchCo2FactorKey } from '../../db/co2Match.js';
import { co2Settings } from '../../services/co2.js';
import {
  foldText,
  HISTORY_STATUS,
  historyChunkSchema,
  historyImportStartSchema,
  historyJoinDatesSchema,
} from '@circularity/shared';

const STARTED = 'history.import_started';
const FINISHED = 'history.imported';
const REMOVED = 'history.removed';
const ENTITY = 'history_import';

/** Imported sessions have no recorded times. These are what most cafes run. */
const DEFAULT_START = '10:00:00';
const DEFAULT_END = '13:00:00';

/** Noon UTC on a date, in milliseconds: the "when" of an imported repair. */
function noonOf(date: string): number {
  return Date.parse(`${date}T12:00:00Z`);
}

// D1 refuses a LIKE pattern this long, so the markers are found by prefix.
function chunkPrefix(importId: string): string {
  return `history_chunk:${importId}:`;
}

function chunkKey(importId: string, chunk: number): string {
  return `${chunkPrefix(importId)}${chunk}`;
}

interface StartedImport {
  id: string;
  publish: boolean;
  fileName: string | null;
  actorId: string | null;
  startedAt: number;
}

/** The import with this id, if it was started and has not been removed. */
async function findImport(d1: D1Database, id: string): Promise<StartedImport | null> {
  const started = await d1
    .prepare(`SELECT actor_id, metadata, created_at FROM audit_log WHERE action = ? AND entity_id = ? LIMIT 1`)
    .bind(STARTED, id)
    .first<{ actor_id: string | null; metadata: string; created_at: number }>();
  if (!started) return null;
  const removed = await d1
    .prepare(`SELECT 1 FROM audit_log WHERE action = ? AND entity_id = ? LIMIT 1`)
    .bind(REMOVED, id)
    .first();
  if (removed) return null;
  let meta: { publish?: boolean; fileName?: string | null } = {};
  try {
    meta = JSON.parse(started.metadata);
  } catch {
    /* an unreadable entry means the defaults */
  }
  return {
    id,
    publish: meta.publish === true,
    fileName: meta.fileName ?? null,
    actorId: started.actor_id,
    startedAt: Number(started.created_at),
  };
}

function notFound(reply: HubReply): void {
  reply.code(404).send({ error: 'That import was not found', code: 'history/not_found' });
}

function badChunk(reply: HubReply, message: string): void {
  reply.code(400).send({ error: message, code: 'history/bad_chunk' });
}

/** What one import added, counted from the rows themselves. */
async function importSummary(d1: D1Database, id: string) {
  const row = await d1
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM events WHERE import_id = ?1) AS sessions,
         (SELECT COUNT(*) FROM repair_jobs WHERE import_id = ?1) AS repairs,
         (SELECT COUNT(*) FROM repair_jobs WHERE import_id = ?1 AND status = 'completed') AS fixed,
         (SELECT COUNT(DISTINCT rj.event_id) FROM repair_jobs rj JOIN events e ON e.id = rj.event_id
            WHERE rj.import_id = ?1 AND (e.import_id IS NULL OR e.import_id <> ?1)) AS joined_sessions,
         (SELECT MIN(e.date) FROM events e WHERE e.import_id = ?1
            OR e.id IN (SELECT event_id FROM repair_jobs WHERE import_id = ?1)) AS first_date,
         (SELECT MAX(e.date) FROM events e WHERE e.import_id = ?1
            OR e.id IN (SELECT event_id FROM repair_jobs WHERE import_id = ?1)) AS last_date,
         (SELECT COUNT(*) FROM venues WHERE import_id = ?1) AS venues`,
    )
    .bind(id)
    .first<Record<string, number | string | null>>();
  return {
    sessions: Number(row?.sessions ?? 0),
    repairs: Number(row?.repairs ?? 0),
    fixed: Number(row?.fixed ?? 0),
    joinedSessions: Number(row?.joined_sessions ?? 0),
    firstDate: (row?.first_date as string | null) ?? null,
    lastDate: (row?.last_date as string | null) ?? null,
    venues: Number(row?.venues ?? 0),
  };
}

/**
 * Volunteers whose first recorded repair is before the date they joined (or
 * who have no joined date). Moving the joined date back makes their profile
 * say how long they have really helped.
 */
async function joinDateSuggestions(d1: D1Database, importId?: string) {
  const onlyImport = importId ? `AND rj.import_id = ?1` : '';
  const statement = d1.prepare(
    `SELECT u.id, u.display_name, u.join_date, MIN(e.date) AS first_repair
     FROM repair_jobs rj
     JOIN events e ON e.id = rj.event_id
     JOIN users u ON u.id = rj.repairer_id
     WHERE e.status IN ('completed', 'active') ${onlyImport}
     GROUP BY u.id
     HAVING u.join_date IS NULL OR MIN(e.date) < u.join_date
     ORDER BY u.display_name`,
  );
  const result = await (importId ? statement.bind(importId) : statement).all<{
    id: string;
    display_name: string;
    join_date: string | null;
    first_repair: string;
  }>();
  return (result.results ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    joinDate: r.join_date,
    firstRepairDate: r.first_repair,
  }));
}

export async function adminHistoryRoutes(app: App): Promise<void> {
  // Everything the browser needs to check a file before anything is sent.
  app.get('/api/admin/history/context', async () => {
    const d1 = bindings().DB;
    const [categories, venues, people, sessions] = await Promise.all([
      d1.prepare('SELECT id, name FROM skill_categories ORDER BY sort_order').all<{ id: string; name: string }>(),
      d1
        .prepare('SELECT id, name, is_home_venue, is_active FROM venues ORDER BY is_home_venue DESC, name')
        .all<{ id: string; name: string; is_home_venue: number; is_active: number }>(),
      // Former volunteers too: their old repairs are part of the history.
      d1.prepare('SELECT id, display_name, email FROM users ORDER BY display_name').all<{ id: string; display_name: string; email: string }>(),
      d1.prepare(`SELECT id, date, venue_id, status FROM events WHERE status <> 'cancelled'`).all<{
        id: string;
        date: string;
        venue_id: string;
        status: string;
      }>(),
    ]);
    return {
      today: localToday(),
      categories: categories.results ?? [],
      venues: (venues.results ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        isHomeVenue: v.is_home_venue === 1,
        isActive: v.is_active === 1,
      })),
      people: (people.results ?? []).map((p) => ({ id: p.id, displayName: p.display_name, email: p.email })),
      sessions: (sessions.results ?? []).map((s) => ({ id: s.id, date: s.date, venueId: s.venue_id, status: s.status })),
    };
  });

  app.post('/api/admin/history/imports', async (request, reply) => {
    const me = request.auth!;
    const parsed = historyImportStartSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const id = crypto.randomUUID();
    // Written directly, not through audit(), because the import depends on it.
    await bindings()
      .DB.prepare(
        `INSERT INTO audit_log (actor_id, actor_type, action, entity_type, entity_id, metadata, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        me.sub,
        me.role,
        STARTED,
        ENTITY,
        id,
        JSON.stringify({ fileName: parsed.data.fileName ?? null, publish: parsed.data.publish }),
        request.ip ?? null,
        Date.now(),
      )
      .run();
    return { id };
  });

  app.post('/api/admin/history/imports/:id/rows', async (request, reply) => {
    const me = request.auth!;
    const { id } = request.params as { id: string };
    const d1 = bindings().DB;
    const started = await findImport(d1, id);
    if (!started) return notFound(reply);

    const parsed = historyChunkSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const chunk = parsed.data;
    const marker = chunkKey(id, chunk.chunk);
    if (await d1.prepare('SELECT 1 FROM hub_meta WHERE key = ?').bind(marker).first()) {
      return { ok: true, alreadySaved: true, sessions: 0, repairs: 0 };
    }

    // What already exists, read once for the whole chunk.
    const [venueRows, ownSessions, categoryRows, userRows, factorRows, cafe, numbers] = await Promise.all([
      d1.prepare('SELECT id, name FROM venues').all<{ id: string; name: string }>(),
      d1.prepare('SELECT id, date, venue_id FROM events WHERE import_id = ?').bind(id).all<{ id: string; date: string; venue_id: string }>(),
      d1.prepare('SELECT id, name FROM skill_categories').all<{ id: string; name: string }>(),
      d1.prepare('SELECT id FROM users').all<{ id: string }>(),
      d1.prepare('SELECT id, key, co2e_kg FROM co2_factors').all<{ id: string; key: string; co2e_kg: number | null }>(),
      d1.prepare('SELECT name FROM cafes LIMIT 1').first<{ name: string }>(),
      d1
        .prepare(
          `SELECT substr(job_number, 1, 4) AS year, MAX(CAST(substr(job_number, 6) AS INTEGER)) AS n
           FROM repair_jobs WHERE job_number GLOB '[0-9][0-9][0-9][0-9]-*' GROUP BY year`,
        )
        .all<{ year: string; n: number }>(),
    ]);
    const venues = new Map((venueRows.results ?? []).map((v) => [v.id, v]));
    const venueByName = new Map((venueRows.results ?? []).map((v) => [foldText(v.name), v.id]));
    const sessionByKey = new Map((ownSessions.results ?? []).map((s) => [`${s.date}|${s.venue_id}`, s.id]));
    const categoryName = new Map((categoryRows.results ?? []).map((c) => [c.id, c.name]));
    const userIds = new Set((userRows.results ?? []).map((u) => u.id));
    const factorByKey = new Map((factorRows.results ?? []).map((f) => [f.key, f]));
    const lastNumber = new Map((numbers.results ?? []).map((r) => [r.year, Number(r.n) || 0]));
    const co2 = await co2Settings();
    const sessionName = cafe?.name?.trim() || 'Repair Café';

    // Sessions this chunk joins that the hub already had. They must exist and
    // have finished, the same rule the browser used.
    const existingIds = [...new Set(chunk.sessions.map((s) => s.existingEventId).filter((v): v is string => !!v))];
    const existing = new Map<string, string>();
    if (existingIds.length) {
      const rows = await d1
        .prepare(`SELECT id, status FROM events WHERE id IN (SELECT value FROM json_each(?))`)
        .bind(JSON.stringify(existingIds))
        .all<{ id: string; status: string }>();
      for (const r of rows.results ?? []) existing.set(r.id, r.status);
    }

    const now = Date.now();
    const statements: D1PreparedStatement[] = [];
    const finishedBy = new Map<string, number>();
    let newSessions = 0;
    let repairs = 0;

    for (const session of chunk.sessions) {
      let eventId: string;
      if (session.existingEventId) {
        if (existing.get(session.existingEventId) !== 'completed') {
          return badChunk(reply, `The session on ${session.date} has changed since the file was checked. Check the file again.`);
        }
        eventId = session.existingEventId;
      } else {
        // The venue: one the hub has, or one this import adds (once).
        let venueId: string;
        if (session.venueId) {
          if (!venues.has(session.venueId)) return badChunk(reply, 'A venue has been removed since the file was checked. Check the file again.');
          venueId = session.venueId;
        } else {
          const name = session.newVenueName!;
          const known = venueByName.get(foldText(name));
          if (known) {
            venueId = known;
          } else {
            venueId = crypto.randomUUID();
            venueByName.set(foldText(name), venueId);
            venues.set(venueId, { id: venueId, name });
            // Added as not active: it is where the cafe used to meet.
            statements.push(
              d1
                .prepare(`INSERT INTO venues (id, name, is_home_venue, is_active, import_id, created_at) VALUES (?, ?, 0, 0, ?, ?)`)
                .bind(venueId, name, id, now),
            );
          }
        }
        // The session: one this import already made for that day and venue, or a new one.
        const key = `${session.date}|${venueId}`;
        const known = sessionByKey.get(key);
        if (known) {
          eventId = known;
        } else {
          eventId = crypto.randomUUID();
          sessionByKey.set(key, eventId);
          newSessions++;
          statements.push(
            d1
              .prepare(
                `INSERT INTO events (id, name, venue_id, date, start_time, end_time, status, is_published, import_id, created_by, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
              )
              .bind(eventId, sessionName, venueId, session.date, DEFAULT_START, DEFAULT_END, started.publish ? 1 : 0, id, me.sub, now, now),
          );
        }
      }

      const year = session.date.slice(0, 4);
      const when = noonOf(session.date);
      for (const item of session.items) {
        const categoryId = item.categoryId && categoryName.has(item.categoryId) ? item.categoryId : null;
        const repairerId = item.repairerId && userIds.has(item.repairerId) ? item.repairerId : null;
        const status = HISTORY_STATUS[item.outcome];
        // The CO2 figure, worked out the same way as for old repairs brought
        // in from a backup: only when the kind of thing is clear.
        const factorKey = matchCo2FactorKey({
          itemDescription: item.item,
          itemBrand: item.brand,
          categoryName: categoryId ? categoryName.get(categoryId) : null,
        });
        const factor = factorKey ? factorByKey.get(factorKey) : undefined;
        const preUse = factor?.co2e_kg === null || factor?.co2e_kg === undefined ? null : Number(factor.co2e_kg);
        const saving =
          status === 'completed' && co2.enabled && preUse !== null && Number.isFinite(preUse) && preUse > 0
            ? Math.round(preUse * co2.displacementRate * 1000) / 1000
            : null;

        for (let n = 0; n < item.quantity; n++) {
          const next = (lastNumber.get(year) ?? 0) + 1;
          lastNumber.set(year, next);
          // Taken on and finished at the same moment, so the repair counts in
          // every total but never in the average repair time.
          statements.push(
            d1
              .prepare(
                `INSERT INTO repair_jobs (
                   id, event_id, job_number, item_description, item_category_id, item_brand, weight_kg,
                   fault_description, status, repairer_id, accepted_at, completed_at, outcome_notes,
                   co2_factor_id, co2_saving_kg, co2_saving_source, gdpr_consent, import_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
              )
              .bind(
                crypto.randomUUID(),
                eventId,
                `${year}-${String(next).padStart(4, '0')}`,
                item.item,
                categoryId,
                item.brand,
                item.weightKg,
                item.fault,
                status,
                repairerId,
                when,
                when,
                item.notes,
                factor?.id ?? null,
                saving,
                saving !== null ? 'calculated' : null,
                id,
                when,
                now,
              ),
          );
          repairs++;
          if (repairerId && (status === 'completed' || status === 'cannot_repair')) {
            finishedBy.set(repairerId, (finishedBy.get(repairerId) ?? 0) + 1);
          }
        }
      }
    }

    // Each volunteer's repair count, the same rule as a repair finished on the day.
    for (const [userId, count] of finishedBy) {
      statements.push(d1.prepare('UPDATE users SET repair_count_cache = repair_count_cache + ? WHERE id = ?').bind(count, userId));
    }
    statements.push(d1.prepare('INSERT INTO hub_meta (key, value, updated_at) VALUES (?, ?, ?)').bind(marker, '1', now));

    try {
      await d1.batch(statements);
    } catch (err) {
      // Two check-ins elsewhere can take a job number at the same moment. The
      // batch is one transaction, so nothing was saved and sending it again works.
      request.log.warn('history chunk failed', err);
      reply.code(409).send({ error: 'This part of the import could not be saved. Please try again.', code: 'history/chunk_failed' });
      return;
    }
    return { ok: true, sessions: newSessions, repairs };
  });

  app.post('/api/admin/history/imports/:id/finish', async (request, reply) => {
    const me = request.auth!;
    const { id } = request.params as { id: string };
    const d1 = bindings().DB;
    const started = await findImport(d1, id);
    if (!started) return notFound(reply);
    const summary = await importSummary(d1, id);
    await d1.prepare(`DELETE FROM hub_meta WHERE substr(key, 1, ?1) = ?2`).bind(chunkPrefix(id).length, chunkPrefix(id)).run();
    await audit({
      request,
      actorId: me.sub,
      actorType: me.role,
      action: FINISHED,
      entityType: ENTITY,
      entityId: id,
      metadata: { fileName: started.fileName, ...summary },
    });
    return { summary, joinDates: await joinDateSuggestions(d1, id) };
  });

  app.get('/api/admin/history/imports', async () => {
    const d1 = bindings().DB;
    const entries = await d1
      .prepare(
        `SELECT a.entity_id, a.action, a.metadata, a.created_at, u.display_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
         WHERE a.entity_type = ? AND a.action IN (?, ?, ?)
         ORDER BY a.created_at DESC`,
      )
      .bind(ENTITY, STARTED, FINISHED, REMOVED)
      .all<{ entity_id: string; action: string; metadata: string; created_at: number; display_name: string | null }>();
    const rows = entries.results ?? [];
    const removed = new Set(rows.filter((r) => r.action === REMOVED).map((r) => r.entity_id));
    const finished = new Set(rows.filter((r) => r.action === FINISHED).map((r) => r.entity_id));
    const list = [];
    for (const r of rows.filter((row) => row.action === STARTED && !removed.has(row.entity_id))) {
      let meta: { fileName?: string | null } = {};
      try {
        meta = JSON.parse(r.metadata);
      } catch {
        /* keep going */
      }
      const summary = await importSummary(d1, r.entity_id);
      // An import that was started but saved nothing is not worth listing.
      if (!finished.has(r.entity_id) && summary.repairs === 0 && summary.sessions === 0) continue;
      list.push({
        id: r.entity_id,
        fileName: meta.fileName ?? null,
        importedAt: new Date(Number(r.created_at)).toISOString(),
        importedBy: r.display_name,
        finished: finished.has(r.entity_id),
        ...summary,
      });
    }
    return list;
  });

  app.delete('/api/admin/history/imports/:id', async (request, reply) => {
    const me = request.auth!;
    const { id } = request.params as { id: string };
    const d1 = bindings().DB;
    const started = await findImport(d1, id);
    if (!started) return notFound(reply);
    const summary = await importSummary(d1, id);

    // One batch, so it all goes or nothing does. Sessions and venues are kept
    // if something else has been recorded against them since.
    await d1.batch([
      d1
        .prepare(
          `UPDATE users SET repair_count_cache = MAX(0, repair_count_cache - (
             SELECT COUNT(*) FROM repair_jobs
             WHERE import_id = ?1 AND repairer_id = users.id AND status IN ('completed', 'cannot_repair')))
           WHERE id IN (SELECT repairer_id FROM repair_jobs WHERE import_id = ?1 AND repairer_id IS NOT NULL)`,
        )
        .bind(id),
      d1.prepare('DELETE FROM repair_jobs WHERE import_id = ?').bind(id),
      d1
        .prepare(
          `DELETE FROM events WHERE import_id = ?1
           AND NOT EXISTS (SELECT 1 FROM repair_jobs WHERE event_id = events.id)
           AND NOT EXISTS (SELECT 1 FROM linux_installs WHERE event_id = events.id)
           AND NOT EXISTS (SELECT 1 FROM event_images WHERE event_id = events.id)`,
        )
        .bind(id),
      d1
        .prepare(
          `DELETE FROM venues WHERE import_id = ?1
           AND NOT EXISTS (SELECT 1 FROM events WHERE venue_id = venues.id)
           AND NOT EXISTS (SELECT 1 FROM event_templates WHERE venue_id = venues.id)`,
        )
        .bind(id),
      d1.prepare(`DELETE FROM hub_meta WHERE substr(key, 1, ?1) = ?2`).bind(chunkPrefix(id).length, chunkPrefix(id)),
      d1
        .prepare(
          `INSERT INTO audit_log (actor_id, actor_type, action, entity_type, entity_id, metadata, ip_address, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(me.sub, me.role, REMOVED, ENTITY, id, JSON.stringify({ fileName: started.fileName, ...summary }), request.ip ?? null, Date.now()),
    ]);
    return { ok: true, removed: summary };
  });

  // Volunteers whose first recorded repair is before their joined date.
  app.get('/api/admin/history/join-dates', async () => joinDateSuggestions(bindings().DB));

  // Move the joined date of these volunteers back to their first recorded repair.
  app.post('/api/admin/history/join-dates', async (request: HubRequest, reply: HubReply) => {
    const me = request.auth!;
    const parsed = historyJoinDatesSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'Validation failed', code: 'validation/failed', details: parsed.error.flatten() });
      return;
    }
    const d1 = bindings().DB;
    const wanted = new Set(parsed.data.ids);
    // Only an earlier date, and never a super admin's unless a super admin asks
    // (the same rule as editing them by hand).
    const suggestions = (await joinDateSuggestions(d1)).filter((s) => wanted.has(s.id));
    let roles = new Map<string, string>();
    if (suggestions.length) {
      const rows = await d1
        .prepare('SELECT id, role FROM users WHERE id IN (SELECT value FROM json_each(?))')
        .bind(JSON.stringify(suggestions.map((s) => s.id)))
        .all<{ id: string; role: string }>();
      roles = new Map((rows.results ?? []).map((r) => [r.id, r.role]));
    }
    const allowed = suggestions.filter((s) => me.role === 'super_admin' || roles.get(s.id) !== 'super_admin');
    if (allowed.length) {
      const now = Date.now();
      await d1.batch(
        allowed.map((s) => d1.prepare('UPDATE users SET join_date = ?, updated_at = ? WHERE id = ?').bind(s.firstRepairDate, now, s.id)),
      );
      await audit({
        request,
        actorId: me.sub,
        actorType: me.role,
        action: 'user.join_dates_moved',
        entityType: 'user',
        metadata: { users: allowed.map((s) => ({ id: s.id, from: s.joinDate, to: s.firstRepairDate })) },
      });
    }
    return { updated: allowed.map((s) => ({ id: s.id, joinDate: s.firstRepairDate })) };
  });
}
