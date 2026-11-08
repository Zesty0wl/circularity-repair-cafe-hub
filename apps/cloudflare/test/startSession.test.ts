// Starting a session by mistake, and putting it back to planned
// (POST /api/admin/events/:id/unstart). Admins pressed Start when they only
// meant to publish a session, so a start can be undone while nothing has been
// recorded at the session.
import { beforeAll, describe, expect, it } from 'vitest';
import { call, freshHub, setUpHub } from './helpers.js';

beforeAll(freshHub);

let admin = '';
let repairer = '';
let venueId = '';

/** A date a number of days from today, as 'YYYY-MM-DD'. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function makeEvent(date: string) {
  const res = await call('/api/admin/events', {
    token: admin,
    json: { name: 'Session', venueId, date, startTime: '10:00', endTime: '13:00', isPublished: true },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as { id: string; checkInToken: string };
}

async function statusOf(id: string): Promise<string> {
  const res = await call(`/api/admin/events/${id}`, { token: admin });
  return res.body.event.status;
}

beforeAll(async () => {
  admin = (await setUpHub()).token;
  venueId = (await call('/api/admin/venues', { token: admin })).body[0].id;
  const user = await call('/api/admin/users', {
    token: admin,
    json: { email: 'rita@fix.example', displayName: 'Rita Repair', role: 'repairer' },
  });
  const signedIn = await call(`/api/auth/reset/${user.body.resetToken}`, { json: { password: 'Soldering1Iron' } });
  repairer = signedIn.body.accessToken;
});

describe('undoing a start', () => {
  it('puts a session started by mistake back to planned', async () => {
    const session = await makeEvent(daysFromNow(14));
    await call(`/api/admin/events/${session.id}/activate`, { method: 'POST', token: admin });
    expect(await statusOf(session.id)).toBe('active');

    const res = await call(`/api/admin/events/${session.id}/unstart`, { method: 'POST', token: admin });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.status).toBe('scheduled');
    expect(await statusOf(session.id)).toBe('scheduled');

    // It is planned again, so the dashboard lists it as coming up.
    const activity = await call('/api/admin/dashboard', { token: admin });
    expect(activity.status).toBe(200);
    expect(activity.body.upcomingEvents.map((e: any) => e.id)).toContain(session.id);
  });

  it('also undoes a start that was then ended', async () => {
    const session = await makeEvent(daysFromNow(21));
    await call(`/api/admin/events/${session.id}/activate`, { method: 'POST', token: admin });
    await call(`/api/admin/events/${session.id}/complete`, { method: 'POST', token: admin });
    expect(await statusOf(session.id)).toBe('completed');

    const res = await call(`/api/admin/events/${session.id}/unstart`, { method: 'POST', token: admin });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await statusOf(session.id)).toBe('scheduled');
  });

  it('refuses once a repair has been recorded', async () => {
    const session = await makeEvent(daysFromNow(0));
    await call(`/api/admin/events/${session.id}/activate`, { method: 'POST', token: admin });
    const checkIn = await call(`/api/checkin/${session.checkInToken}/jobs`, {
      json: { customerName: 'Sam', gdprConsent: true, itemDescription: 'Lamp', faultDescription: 'Flickers' },
    });
    expect(checkIn.status, JSON.stringify(checkIn.body)).toBe(200);

    const res = await call(`/api/admin/events/${session.id}/unstart`, { method: 'POST', token: admin });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('event/has_repairs');
    expect(await statusOf(session.id)).toBe('active');
  });

  it('refuses a session that has not started, or does not exist', async () => {
    const session = await makeEvent(daysFromNow(28));
    const notStarted = await call(`/api/admin/events/${session.id}/unstart`, { method: 'POST', token: admin });
    expect(notStarted.status).toBe(400);
    expect(notStarted.body.code).toBe('event/not_started');

    const missing = await call('/api/admin/events/00000000-0000-4000-8000-000000000000/unstart', { method: 'POST', token: admin });
    expect(missing.status).toBe(404);
  });

  it('is for admins only', async () => {
    const session = await makeEvent(daysFromNow(35));
    await call(`/api/admin/events/${session.id}/activate`, { method: 'POST', token: admin });
    const res = await call(`/api/admin/events/${session.id}/unstart`, { method: 'POST', token: repairer });
    expect(res.status).toBe(403);
    expect(await statusOf(session.id)).toBe('active');
  });
});
