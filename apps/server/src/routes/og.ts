import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cafes, events, venues } from '../db/schema.js';
import { asc, eq, gte } from 'drizzle-orm';
import { renderCard, type CardContent } from '../services/ogImage.js';

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
    subtitle: 'Thousands of Repair Cafés, on one globe',
  },
  guides: {
    title: 'Repair guides',
    subtitle: 'Thousands of step-by-step guides from iFixit',
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
}
