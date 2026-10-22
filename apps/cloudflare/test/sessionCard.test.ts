// Session card numbers: a short number on the job, unique among the open jobs
// in an event, so a reusable card can be handed out and called back. See
// migrations/0006_session_card_number.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import { call, freshHub, setUpHub } from './helpers.js';

beforeAll(freshHub);

describe('session card numbers', () => {
  let admin = '';
  let repairer = '';

  it('keeps a number unique among open jobs, and frees it when the job closes', async () => {
    admin = (await setUpHub()).token;
    const venueId = (await call('/api/admin/venues', { token: admin })).body[0].id;
    const date = new Date().toISOString().slice(0, 10);
    const created = await call('/api/admin/events', {
      token: admin,
      json: { name: 'Saturday session', venueId, date, startTime: '10:00', endTime: '13:00', isPublished: true },
    });
    await call(`/api/admin/events/${created.body.id}/activate`, { method: 'POST', token: admin });

    const user = await call('/api/admin/users', {
      token: admin,
      json: { email: 'fixer@example.org', displayName: 'Ada Fixwell', role: 'repairer' },
    });
    repairer = (await call(`/api/auth/reset/${user.body.resetToken}`, { json: { password: 'Soldering1Iron' } })).body
      .accessToken;

    const first = await call('/api/repairer/checkin', {
      token: repairer,
      json: { itemDescription: 'Kettle', faultDescription: 'Dead', cardNumber: 7 },
    });
    expect(first.status).toBe(200);

    const stored = await call(`/api/admin/repairs/${first.body.id}`, { token: admin });
    expect(stored.body.job.cardNumber).toBe(7);

    // The same number while the first job is open is refused.
    const clash = await call('/api/repairer/checkin', {
      token: repairer,
      json: { itemDescription: 'Lamp', faultDescription: 'Broken', cardNumber: 7 },
    });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe('checkin/card_in_use');

    // A different number is fine; a number out of range is refused.
    const second = await call('/api/repairer/checkin', {
      token: repairer,
      json: { itemDescription: 'Toaster', faultDescription: 'Dead', cardNumber: 8 },
    });
    expect(second.status).toBe(200);
    const bad = await call('/api/repairer/checkin', {
      token: repairer,
      json: { itemDescription: 'Radio', faultDescription: 'Dead', cardNumber: 0 },
    });
    expect(bad.status).toBe(400);

    // Close the first job, and its number can be handed out again.
    await call(`/api/repairer/jobs/${first.body.id}/accept`, { method: 'PATCH', token: repairer });
    await call(`/api/repairer/jobs/${first.body.id}/complete`, { method: 'PATCH', token: repairer, json: { outcome: 'completed' } });
    const reuse = await call('/api/repairer/checkin', {
      token: repairer,
      json: { itemDescription: 'Fan', faultDescription: 'Rattles', cardNumber: 7 },
    });
    expect(reuse.status).toBe(200);
  });

  it('shows the card number on the waiting-room display', async () => {
    const link = await call('/api/admin/display-link', { token: admin });
    const shown = await call(`/api/display/${link.body.token}`);
    const numbers = shown.body.jobs.map((j: any) => j.cardNumber);
    expect(numbers).toContain(8);
  });
});
