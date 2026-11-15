// Adding past sessions from a spreadsheet, and moving volunteers' joined
// dates back. The browser reads the file with packages/shared/src/history.ts
// and sends chunks to routes/admin/history.ts, and these tests do the same.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildHistoryPreview,
  canImportHistory,
  chunkHistory,
  historySampleCsv,
  parseCsv,
  parseHistoryDate,
  type HistoryContext,
} from '../../../packages/shared/src/history.js';
import { call, freshHub, setUpHub } from './helpers.js';

const CONTEXT: HistoryContext = {
  today: '2026-11-15',
  categories: [
    { id: 'cat-elec', name: 'Electronics' },
    { id: 'cat-app', name: 'Small appliances' },
    { id: 'cat-cloth', name: 'Clothing & textiles' },
  ],
  venues: [
    { id: 'v-home', name: 'Village Hall', isHomeVenue: true, isActive: true },
    { id: 'v-old', name: 'Church Rooms', isHomeVenue: false, isActive: false },
  ],
  people: [
    { id: 'u-ada', displayName: 'Ada Fixwell', email: 'ada@example.org' },
    { id: 'u-bo', displayName: 'Bo Solder', email: 'bo@example.org' },
  ],
  sessions: [{ id: 'e-done', date: '2024-05-11', venueId: 'v-home', status: 'completed' }],
};

describe('reading a file of past sessions', () => {
  it('reads dates written either way', () => {
    expect(parseHistoryDate('2019-09-14')).toBe('2019-09-14');
    expect(parseHistoryDate('14/09/2019')).toBe('2019-09-14');
    expect(parseHistoryDate('14.09.2019')).toBe('2019-09-14');
    expect(parseHistoryDate('4/9/19')).toBe('2019-09-04');
    expect(parseHistoryDate('14/09/2019 00:00')).toBe('2019-09-14');
    expect(parseHistoryDate('31/02/2019')).toBeNull();
    expect(parseHistoryDate('09/14/2019')).toBeNull(); // month first is not accepted
    expect(parseHistoryDate('soon')).toBeNull();
  });

  it('reads quoted cells, semicolons and a byte order mark', () => {
    expect(parseCsv('﻿a;b\r\n"x; y";"say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x; y', 'say "hi"'],
    ]);
    expect(parseCsv('a,b\n"line one\nline two",2')).toEqual([
      ['a', 'b'],
      ['line one\nline two', '2'],
    ]);
  });

  it('turns rows into sessions, with tallies and sessions with nothing written down', () => {
    const csv = [
      'Date,Venue,Item,Category,Brand,Fault,Outcome,Number of items,Weight (kg),Repairer,Notes',
      '14/09/2019,,Kettle,small appliances,Russell Hobbs,No power,Fixed,,1.2,ada@example.org,New fuse',
      '14/09/2019,,Radio,Electronics,,No sound,not fixed,,,Bo Solder,',
      '12/10/2019,Church Rooms,,,,,Repaired,14,,,',
      '12/10/2019,Church Rooms,,,,,No,5,,,',
      '09/11/2019,,,,,,,,,,',
      '',
    ].join('\n');
    const preview = buildHistoryPreview(csv, CONTEXT, 'en');
    expect(preview.problems).toEqual([]);
    expect(canImportHistory(preview)).toBe(true);
    expect(preview.totals).toMatchObject({
      newSessions: 3,
      existingSessions: 0,
      items: 21,
      fixed: 15,
      notFixed: 6,
      other: 0,
      firstDate: '2019-09-14',
      lastDate: '2019-11-09',
      newVenues: [],
    });
    const [first, second, third] = preview.sessions;
    expect(first!.venueId).toBe('v-home');
    expect(first!.items[0]).toMatchObject({ item: 'Kettle', categoryId: 'cat-app', weightKg: 1.2, repairerId: 'u-ada', outcome: 'fixed' });
    expect(first!.items[1]).toMatchObject({ repairerId: 'u-bo', outcome: 'not_fixed' });
    expect(second!.venueId).toBe('v-old');
    expect(second!.items[0]).toMatchObject({ item: 'Not recorded', quantity: 14, outcome: 'fixed' });
    expect(third!.items).toEqual([]);
  });

  it('reads a French file saved by Excel', () => {
    const csv = '﻿Date;Lieu;Objet;Catégorie;Marque;Panne;Résultat;Poids (kg)\r\n14/09/2019;;Bouilloire;;;;Réparé;1,5\r\n15/09/2019;Salle des fêtes;;;;;Non réparé;\r\n';
    const preview = buildHistoryPreview(csv, CONTEXT, 'fr');
    expect(preview.problems.filter((p) => p.severity === 'error')).toEqual([]);
    expect(preview.sessions[0]!.items[0]).toMatchObject({ item: 'Bouilloire', outcome: 'fixed', weightKg: 1.5 });
    expect(preview.sessions[1]!.items[0]).toMatchObject({ item: 'Non renseigné', outcome: 'not_fixed' });
    expect(preview.totals.newVenues).toEqual(['Salle des fêtes']);
  });

  it('stops on mistakes and says which row they are on', () => {
    const csv = [
      'Date,Item,Outcome,Number of items',
      '14/09/2030,Kettle,Fixed,',
      '25/13/2019,Kettle,Fixed,',
      '14/09/2019,Kettle,Maybe,',
      '14/09/2019,Kettle,Fixed,two',
    ].join('\n');
    const preview = buildHistoryPreview(csv, CONTEXT, 'en');
    expect(canImportHistory(preview)).toBe(false);
    expect(preview.problems.map((p) => [p.row, p.severity])).toEqual([
      [2, 'error'],
      [3, 'error'],
      [4, 'error'],
      [5, 'error'],
    ]);
  });

  it('needs a Date column', () => {
    const preview = buildHistoryPreview('When,Item\n2019-01-01,Kettle', CONTEXT, 'en');
    expect(preview.problems[0]).toMatchObject({ row: 1, severity: 'error' });
  });

  it('warns about names it cannot match, once each, and still imports', () => {
    const csv = ['Date,Item,Category,Outcome,Repairer', '2019-01-05,Lamp,Lighting,Fixed,Cy', '2019-01-05,Lamp,Lighting,Fixed,Cy'].join('\n');
    const preview = buildHistoryPreview(csv, CONTEXT, 'en');
    expect(preview.problems.map((p) => p.severity)).toEqual(['warning', 'warning']);
    expect(canImportHistory(preview)).toBe(true);
    expect(preview.sessions[0]!.items.every((i) => i.categoryId === null && i.repairerId === null)).toBe(true);
  });

  it('adds to a finished session the hub already has, and says so', () => {
    const preview = buildHistoryPreview('Date,Item,Outcome\n11/05/2024,Toaster,Fixed', CONTEXT, 'en');
    expect(preview.sessions[0]!.existingEventId).toBe('e-done');
    expect(preview.totals.existingSessions).toBe(1);
    expect(preview.problems).toHaveLength(1);
    expect(preview.problems[0]!.severity).toBe('warning');
  });

  it('splits a big import into chunks, splitting a tally if it must', () => {
    const csv = ['Date,Outcome,Number of items', '2019-01-05,Fixed,100', '2019-01-05,Not fixed,80', '2019-02-02,Fixed,10'].join('\n');
    const chunks = chunkHistory(buildHistoryPreview(csv, CONTEXT, 'en').sessions, 150);
    const sizes = chunks.map((c) => c.reduce((n, s) => n + s.items.reduce((m, i) => m + i.quantity, 0), 0));
    expect(sizes).toEqual([150, 40]);
    // The 80 not fixed are split 50 and 30, and the second part keeps its session.
    expect(chunks[0]!.flatMap((s) => s.items.map((i) => i.quantity))).toEqual([100, 50]);
    expect(chunks[1]!.map((s) => s.date)).toEqual(['2019-01-05', '2019-02-02']);
    expect(chunks[1]![0]!.items[0]).toMatchObject({ outcome: 'not_fixed', quantity: 30 });
  });

  it('gives a sample file that imports with no problems, in both languages', () => {
    for (const locale of ['en', 'fr'] as const) {
      const { text } = historySampleCsv(locale, { categoryNames: CONTEXT.categories.map((c) => c.name) });
      const preview = buildHistoryPreview(text, CONTEXT, locale);
      expect(preview.problems, locale).toEqual([]);
      expect(preview.totals.items).toBe(22);
      expect(preview.totals.newSessions).toBe(3);
    }
  });
});

describe('importing past sessions into a hub', () => {
  let admin = '';
  let repairer = '';
  let fixerId = '';
  let importId = '';

  async function send(csv: string, publish = false) {
    const context = (await call('/api/admin/history/context', { token: admin })).body as HistoryContext;
    const preview = buildHistoryPreview(csv, context, 'en');
    expect(preview.problems.filter((p) => p.severity === 'error')).toEqual([]);
    const start = await call('/api/admin/history/imports', { token: admin, json: { fileName: 'old.csv', publish } });
    expect(start.status).toBe(200);
    const id = start.body.id as string;
    const chunks = chunkHistory(preview.sessions, 150);
    for (let i = 0; i < chunks.length; i++) {
      const res = await call(`/api/admin/history/imports/${id}/rows`, { token: admin, json: { chunk: i, sessions: chunks[i] } });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    return { id, chunks };
  }

  beforeAll(async () => {
    await freshHub();
    admin = (await setUpHub()).token;
    const user = await call('/api/admin/users', {
      token: admin,
      json: { email: 'fixer@example.org', displayName: 'Ada Fixwell', role: 'repairer' },
    });
    fixerId = user.body.user.id;
    repairer = (await call(`/api/auth/reset/${user.body.resetToken}`, { json: { password: 'Soldering1Iron' } })).body.accessToken;
  });

  it('is only for admins', async () => {
    expect((await call('/api/admin/history/context', { token: repairer })).status).toBe(403);
    expect((await call('/api/admin/history/imports', { token: repairer, json: {} })).status).toBe(403);
  });

  it('adds sessions and repairs that every figure counts', async () => {
    const csv = [
      'Date,Venue,Item,Category,Outcome,Number of items,Repairer',
      '14/09/2019,,Kettle,Small appliances,Fixed,,fixer@example.org',
      '14/09/2019,,Toaster,Small appliances,Not fixed,,Ada Fixwell',
      '12/10/2019,Old Scout Hut,,,Fixed,200,',
      '12/10/2019,Old Scout Hut,,,Other,3,',
      '09/11/2019,,,,,,',
    ].join('\n');
    const { id, chunks } = await send(csv);
    importId = id;
    expect(chunks.length).toBe(2); // 205 items, more than one request holds

    const finish = await call(`/api/admin/history/imports/${id}/finish`, { token: admin, json: {} });
    expect(finish.status).toBe(200);
    expect(finish.body.summary).toMatchObject({ sessions: 3, repairs: 205, fixed: 201, firstDate: '2019-09-14', lastDate: '2019-11-09', venues: 1 });

    const stats = (await call('/api/public/stats')).body;
    expect(stats.eventCount).toBe(3);
    expect(stats.repairCount).toBe(205);
    expect(stats.completedCount).toBe(201);
    expect(stats.successRate).toBe(Math.round((201 / 202) * 100));
    // "Repairing since" on the home page goes back to the first past session.
    expect(stats.firstSessionDate).toBe('2019-09-14');
    // The kettle is a known kind of thing, so its CO2 saving counts.
    expect(stats.co2SavedKg).toBeGreaterThan(0);

    const overview = (await call('/api/admin/stats/overview?range=all', { token: admin })).body;
    expect(overview.eventCount).toBe(3);
    expect(overview.avgDurationMin).toBe(0); // imported repairs have no times

    // Job numbers follow the year of the session.
    const repairs = (await call('/api/admin/repairs?perPage=100', { token: admin })).body.data as any[];
    expect(repairs.every((r) => /^2019-\d{4}$/.test(r.jobNumber))).toBe(true);

    // The volunteer's count went up by the two items they finished.
    const fixer = (await call(`/api/admin/users/${fixerId}`, { token: admin })).body;
    expect(fixer.repairCountCache).toBe(2);

    // The new venue is kept as a past (not active) venue.
    const venues = (await call('/api/admin/venues', { token: admin })).body as any[];
    expect(venues.find((v) => v.name === 'Old Scout Hut')?.isActive).toBe(false);

    // Not published unless asked, so the public list of sessions is unchanged.
    const publicEvents = (await call('/api/public/events?past=true')).body as any[];
    expect(publicEvents).toHaveLength(0);

    // And it offers to move Ada's joined date back to her first repair.
    expect(finish.body.joinDates).toEqual([
      { id: fixerId, displayName: 'Ada Fixwell', joinDate: fixer.joinDate, firstRepairDate: '2019-09-14' },
    ]);
  });

  it('ignores a chunk that is sent twice', async () => {
    const { id, chunks } = await send('Date,Item,Outcome\n2018-03-03,Lamp,Fixed');
    const again = await call(`/api/admin/history/imports/${id}/rows`, { token: admin, json: { chunk: 0, sessions: chunks[0] } });
    expect(again.body.alreadySaved).toBe(true);
    const finish = await call(`/api/admin/history/imports/${id}/finish`, { token: admin, json: {} });
    expect(finish.body.summary.repairs).toBe(1);
    expect((await call(`/api/admin/history/imports/${id}`, { method: 'DELETE', token: admin })).status).toBe(200);
  });

  it('lists imports and removes everything one added', async () => {
    const list = (await call('/api/admin/history/imports', { token: admin })).body as any[];
    expect(list.map((i) => i.id)).toEqual([importId]);
    expect(list[0]).toMatchObject({ fileName: 'old.csv', finished: true, repairs: 205, importedBy: 'Ada Admin' });

    const removed = await call(`/api/admin/history/imports/${importId}`, { method: 'DELETE', token: admin });
    expect(removed.status).toBe(200);
    const stats = (await call('/api/public/stats')).body;
    expect(stats.eventCount).toBe(0);
    expect(stats.repairCount).toBe(0);
    const fixer = (await call(`/api/admin/users/${fixerId}`, { token: admin })).body;
    expect(fixer.repairCountCache).toBe(0);
    const venues = (await call('/api/admin/venues', { token: admin })).body as any[];
    expect(venues.some((v) => v.name === 'Old Scout Hut')).toBe(false);
    expect((await call('/api/admin/history/imports', { token: admin })).body).toEqual([]);
    expect((await call(`/api/admin/history/imports/${importId}`, { method: 'DELETE', token: admin })).status).toBe(404);
  });

  it('adds to a finished session already in the hub, and removing leaves that session', async () => {
    const venueId = (await call('/api/admin/venues', { token: admin })).body[0].id;
    const created = await call('/api/admin/events', {
      token: admin,
      json: { name: 'Hub session', venueId, date: '2026-11-01', startTime: '10:00', endTime: '13:00' },
    });
    await call(`/api/admin/events/${created.body.id}/activate`, { method: 'POST', token: admin });
    await call(`/api/admin/events/${created.body.id}/complete`, { method: 'POST', token: admin });

    const { id } = await send('Date,Item,Outcome\n01/11/2026,Paper log item,Fixed');
    const finish = await call(`/api/admin/history/imports/${id}/finish`, { token: admin, json: {} });
    expect(finish.body.summary).toMatchObject({ sessions: 0, joinedSessions: 1, repairs: 1 });
    expect((await call('/api/public/stats')).body).toMatchObject({ eventCount: 1, repairCount: 1 });

    await call(`/api/admin/history/imports/${id}`, { method: 'DELETE', token: admin });
    expect((await call('/api/public/stats')).body).toMatchObject({ eventCount: 1, repairCount: 0 });
  });
});

describe("a volunteer's joined date", () => {
  let admin = '';
  let userId = '';

  beforeAll(async () => {
    // The same hub as above, which has no imports left by now.
    admin = (await call('/api/auth/login', { json: { email: 'ada@example.org', password: 'CorrectHorse42' } })).body.accessToken;
    const user = await call('/api/admin/users', {
      token: admin,
      json: { email: 'bo@example.org', displayName: 'Bo Solder', role: 'repairer' },
    });
    userId = user.body.user.id;
  });

  it('can be moved back to before the hub', async () => {
    const res = await call(`/api/admin/users/${userId}`, { method: 'PATCH', token: admin, json: { joinDate: '2015-03-14' } });
    expect(res.status).toBe(200);
    expect(res.body.joinDate).toBe('2015-03-14');
    const profile = (await call(`/api/public/repairers/${userId}`)).body;
    expect(profile.joinDate).toBe('2015-03-14');
  });

  it('can be given when the volunteer is added', async () => {
    const res = await call('/api/admin/users', {
      token: admin,
      json: { email: 'cy@example.org', displayName: 'Cy Glue', role: 'repairer', joinDate: '2012-06-02' },
    });
    expect(res.status).toBe(200);
    expect(res.body.user.joinDate).toBe('2012-06-02');
  });

  it('cannot be in the future, or not a date', async () => {
    const future = await call(`/api/admin/users/${userId}`, { method: 'PATCH', token: admin, json: { joinDate: '2999-01-01' } });
    expect(future.status).toBe(400);
    const nonsense = await call(`/api/admin/users/${userId}`, { method: 'PATCH', token: admin, json: { joinDate: 'last year' } });
    expect(nonsense.status).toBe(400);
  });

  it('can be moved back to the first recorded repair in one step', async () => {
    const context = (await call('/api/admin/history/context', { token: admin })).body as HistoryContext;
    const preview = buildHistoryPreview('Date,Item,Outcome,Repairer\n2011-01-08,Lamp,Fixed,Bo Solder', context, 'en');
    const id = (await call('/api/admin/history/imports', { token: admin, json: {} })).body.id;
    await call(`/api/admin/history/imports/${id}/rows`, { token: admin, json: { chunk: 0, sessions: chunkHistory(preview.sessions)[0] } });
    await call(`/api/admin/history/imports/${id}/finish`, { token: admin, json: {} });

    const suggestions = (await call('/api/admin/history/join-dates', { token: admin })).body as any[];
    expect(suggestions).toEqual([{ id: userId, displayName: 'Bo Solder', joinDate: '2015-03-14', firstRepairDate: '2011-01-08' }]);
    const moved = await call('/api/admin/history/join-dates', { token: admin, json: { ids: [userId] } });
    expect(moved.body.updated).toEqual([{ id: userId, joinDate: '2011-01-08' }]);
    expect((await call('/api/admin/history/join-dates', { token: admin })).body).toEqual([]);
  });
});
