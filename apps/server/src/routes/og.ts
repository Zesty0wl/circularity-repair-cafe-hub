import type { FastifyInstance } from 'fastify';
import { SHARE_CARD_STYLES, type ShareCardStyle } from '@circularity/shared';
import { db } from '../db/index.js';
import { cafes, events, skillCategories, users, venues } from '../db/schema.js';
import { and, asc, eq, gte, ne } from 'drizzle-orm';
import { renderCard, type CardContent } from '../services/ogImage.js';
import { avatarDiskPath, renderRepairerCard } from '../services/shareCard.js';

/**
 * Sharing pictures, one per section.
 *
 * These are fetched by Facebook, WhatsApp, Slack and the like when someone
 * pastes a link, so they must be plain public images with no redirect and no
 * cookie. See services/ogImage.ts for how they are drawn.
 */

/** The sections that get a card, and what each card says. */
const SECTIONS: Record<string, { title: string; subtitle?: string }> = {
  home: { title: 'Free community repairs', subtitle: 'Bring a broken thing, fix it together' },
  events: { title: 'Upcoming repair sessions' },
  skills: { title: 'What we can repair' },
  contact: { title: 'Come and find us' },
  world: {
    title: 'Part of a worldwide movement',
    subtitle: 'Thousands of Repair Cafés, on one map',
  },
  guides: {
    title: 'Repair guides',
    subtitle: 'Thousands of step-by-step guides from iFixit',
  },
  linux: {
    title: 'Linux Repair Cafe',
    subtitle: 'Give your old computer years more life, for free',
  },
};

/** Long date, e.g. "Saturday 9 August". */
function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

export async function ogRoutes(app: FastifyInstance): Promise<void> {
  async function branding() {
    const [cafe] = await db
      .select({
        name: cafes.name,
        primaryColor: cafes.primaryColor,
        accentColor: cafes.accentColor,
      })
      .from(cafes)
      .limit(1);
    return {
      cafeName: cafe?.name?.trim() || 'Repair Café',
      primaryColor: cafe?.primaryColor ?? null,
      accentColor: cafe?.accentColor ?? null,
    };
  }

  async function send(reply: any, content: CardContent) {
    const png = await renderCard(content, await branding());
    if (!png) {
      reply.code(404).send({ error: 'Sharing image not available', code: 'og/failed' });
      return;
    }
    void reply
      .type('image/png')
      // The filename does not change when the content does, so this is a day
      // rather than forever. Long enough to spare the server, short enough that
      // a rebrand shows up the next time a link is shared.
      .header('Cache-Control', 'public, max-age=86400')
      .send(png);
  }

  app.get('/og/section/:key.png', async (request, reply) => {
    const { key } = request.params as { key: string };
    const section = SECTIONS[key];
    if (!section) {
      reply.code(404).send({ error: 'Unknown section', code: 'og/unknown' });
      return;
    }

    // The events card names the next session, so a shared link says when to
    // turn up rather than just that sessions exist.
    if (key === 'events') {
      const today = new Date().toISOString().slice(0, 10);
      const [next] = await db
        .select({ date: events.date })
        .from(events)
        .where(gte(events.date, today))
        .orderBy(asc(events.date))
        .limit(1);
      await send(reply, {
        ...section,
        subtitle: next ? `Next session: ${longDate(next.date)}` : section.subtitle,
      });
      return;
    }

    await send(reply, section);
  });

  // An event gets its own card, so sharing a session shows its date.
  app.get('/og/event/:id.png', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [event] = await db
      .select({ name: events.name, date: events.date, venue: venues.name })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(eq(events.id, id))
      .limit(1);

    if (!event) {
      reply.code(404).send({ error: 'Event not found', code: 'og/unknown' });
      return;
    }
    await send(reply, {
      title: event.name,
      subtitle: [longDate(event.date), event.venue].filter(Boolean).join(' · '),
    });
  });

  // A volunteer's sharing card: their portrait, what they fix, what else
  // people can bring, and the next session. Drawn in one of a few styles,
  // chosen with ?style=. The web app's share menu previews all of them.
  app.get('/og/repairer/:id.png', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { style: styleRaw } = request.query as { style?: string };
    const style: ShareCardStyle =
      SHARE_CARD_STYLES.find((s) => s === styleRaw) ?? SHARE_CARD_STYLES[0];

    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      reply.code(404).send({ error: 'Repairer not found', code: 'og/unknown' });
      return;
    }
    // Hidden and inactive volunteers get no card, matching their public page.
    const [user] = await db
      .select({ displayName: users.displayName, avatarUrl: users.avatarUrl, skills: users.skills })
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true), eq(users.showOnPublicPage, true)))
      .limit(1);
    if (!user) {
      reply.code(404).send({ error: 'Repairer not found', code: 'og/unknown' });
      return;
    }

    // Their own categories become "Fixes ...", the rest of the cafe's active
    // categories become "You can also bring ...".
    const cats = await db
      .select({ id: skillCategories.id, name: skillCategories.name })
      .from(skillCategories)
      .where(eq(skillCategories.isActive, true))
      .orderBy(asc(skillCategories.sortOrder), asc(skillCategories.name));
    const mine = new Set(user.skills ?? []);
    const skills = cats.filter((c) => mine.has(c.id)).map((c) => c.name);
    const otherSkills = cats.filter((c) => !mine.has(c.id)).map((c) => c.name);

    // The next published session, same filter as the public events list.
    const today = new Date().toISOString().slice(0, 10);
    const [next] = await db
      .select({
        date: events.date,
        startTime: events.startTime,
        endTime: events.endTime,
        venue: venues.name,
      })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(and(eq(events.isPublished, true), ne(events.status, 'cancelled'), gte(events.date, today)))
      .orderBy(asc(events.date), asc(events.startTime))
      .limit(1);
    const event = next
      ? {
          dateLine: `${longDate(next.date)}, ${next.startTime.slice(0, 5)} to ${next.endTime.slice(0, 5)}`,
          venueLine: next.venue ?? '',
        }
      : null;

    const png = await renderRepairerCard(
      {
        displayName: user.displayName,
        avatarPath: avatarDiskPath(user.avatarUrl),
        skills,
        otherSkills,
        event,
        brand: await branding(),
      },
      style,
    );
    if (!png) {
      reply.code(404).send({ error: 'Sharing image not available', code: 'og/failed' });
      return;
    }
    void reply
      .type('image/png')
      // Shorter than the section cards, because a profile and the session
      // list change more often than a section title does.
      .header('Cache-Control', 'public, max-age=3600')
      .send(png);
  });
}
