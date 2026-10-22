// Repair times leave out a repair that was finished at a later session. A real
// hub had one taken on in August and closed in September, which turned an
// average of about an hour into 420 hours. See packages/shared/src/repairTime.ts.
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { call, freshHub, setUpHub } from './helpers.js';

beforeAll(freshHub);

const MINUTE = 60_000;
const db = () => (env as unknown as { DB: D1Database }).DB;

describe('repair times', () => {
  let admin = '';
  let eventId = '';
  let carriedOver = '';

  it('averages only repairs finished within one sitting', async () => {
    admin = (await setUpHub()).token;
    const venueId = (await call('/api/admin/venues', { token: admin })).body[0].id;
    const date = new Date().toISOString().slice(0, 10);
    const created = await call('/api/admin/events', {
      token: admin,
      json: { name: 'Saturday session', venueId, date, startTime: '10:00', endTime: '13:00', isPublished: true },
    });
    eventId = created.body.id;
    await call(`/api/admin/events/${eventId}/activate`, { method: 'POST', token: admin });

    const checkIn = async (item: string) =>
      (
        await call(`/api/checkin/${created.body.checkInToken}/jobs`, {
          json: { customerName: 'Sam', gdprConsent: true, itemDescription: item, faultDescription: 'Broken' },
        })
      ).body.id as string;
    const quick = await checkIn('Lamp');
    carriedOver = await checkIn('Toaster');

    // One repair took 83 minutes. The other was taken on, waited for a part,
    // and was only closed 35 days later.
    const start = Date.now() - 40 * 24 * 60 * MINUTE;
    const timed = db().prepare(
      "UPDATE repair_jobs SET status = 'cannot_repair', accepted_at = ?, completed_at = ? WHERE id = ?",
    );
    await timed.bind(start, start + 83 * MINUTE, quick).run();
    await timed.bind(start, start + 35 * 24 * 60 * MINUTE, carriedOver).run();

    const overview = await call('/api/admin/stats/overview?range=all', { token: admin });
    expect(overview.body.avgDurationMin).toBe(83);

    const events = await call('/api/admin/stats/events?range=all', { token: admin });
    expect(events.body.find((e: any) => e.id === eventId).avgDurationMin).toBe(83);
  });

  it('says the carried-over repair was finished later, and leaves it out of the session total', async () => {
    const detail = await call(`/api/admin/stats/events/${eventId}`, { token: admin });
    expect(detail.body.totals.avgDurationMin).toBe(83);
    expect(detail.body.totals.totalDurationMin).toBe(83);
    const job = detail.body.jobs.find((j: any) => j.id === carriedOver);
    expect(job).toMatchObject({ durationMin: null, finishedLater: true });
  });
});
