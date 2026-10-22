// The optional check-in details: the item's weight, and whether the visitor is
// new. Both are nullable and used for reporting (mass kept out of waste, new vs
// returning visitors). See migrations/0004_checkin_weight_first_visit.ts, and
// migrations/0007_feature_switches.ts for the switches that show them.
import { beforeAll, describe, expect, it } from 'vitest';
import { call, freshHub, setUpHub } from './helpers.js';

beforeAll(freshHub);

describe('check-in details', () => {
  let admin = '';
  let checkInToken = '';

  it('keeps weight and first-visit from a public check-in', async () => {
    admin = (await setUpHub()).token;
    const venueId = (await call('/api/admin/venues', { token: admin })).body[0].id;
    const date = new Date().toISOString().slice(0, 10);
    const created = await call('/api/admin/events', {
      token: admin,
      json: { name: 'Saturday session', venueId, date, startTime: '10:00', endTime: '13:00', isPublished: true },
    });
    checkInToken = created.body.checkInToken;
    await call(`/api/admin/events/${created.body.id}/activate`, { method: 'POST', token: admin });

    const job = await call(`/api/checkin/${checkInToken}/jobs`, {
      json: {
        customerName: 'Sam Visitor',
        gdprConsent: true,
        itemDescription: 'Kettle',
        faultDescription: 'No power',
        weightKg: 1.25,
        isFirstVisit: true,
      },
    });
    expect(job.status).toBe(200);

    const stored = await call(`/api/admin/repairs/${job.body.id}`, { token: admin });
    // The numeric column reads back with a fixed number of decimals.
    expect(stored.body.job.weightKg).toBe('1.250');
    expect(stored.body.job.isFirstVisit).toBe(true);
  });

  it('a staff-assisted check-in can record them too, and stats total the weight', async () => {
    const user = await call('/api/admin/users', {
      token: admin,
      json: { email: 'fixer@example.org', displayName: 'Ada Fixwell', role: 'repairer' },
    });
    const repairer = (await call(`/api/auth/reset/${user.body.resetToken}`, { json: { password: 'Soldering1Iron' } })).body
      .accessToken;

    const job = await call('/api/repairer/checkin', {
      token: repairer,
      json: { itemDescription: 'Toaster', faultDescription: 'Dead', weightKg: 3.5, isFirstVisit: false },
    });
    expect(job.status).toBe(200);
    const stored = await call(`/api/admin/repairs/${job.body.id}`, { token: admin });
    expect(stored.body.job.weightKg).toBe('3.500');
    expect(stored.body.job.isFirstVisit).toBe(false);

    // Only fixed items count towards the weight kept out of the bin.
    let stats = await call('/api/admin/stats/overview', { token: admin });
    expect(stats.status).toBe(200);
    expect(stats.body.fixedWeightKg).toBe(0);
    await call(`/api/admin/repairs/${job.body.id}`, { method: 'PATCH', token: admin, json: { status: 'completed' } });
    stats = await call('/api/admin/stats/overview', { token: admin });
    expect(stats.body.fixedWeightKg).toBeCloseTo(3.5, 2);
  });

  it('keeps "not answered" apart from "not a first visit"', async () => {
    const job = await call(`/api/checkin/${checkInToken}/jobs`, {
      json: { customerName: 'Sam Visitor', gdprConsent: true, itemDescription: 'Radio', faultDescription: 'Crackles' },
    });
    expect(job.status).toBe(200);
    let stored = await call(`/api/admin/repairs/${job.body.id}`, { token: admin });
    expect(stored.body.job.isFirstVisit).toBeNull();
    // Saving the repair with no answer leaves it unanswered.
    await call(`/api/admin/repairs/${job.body.id}`, { method: 'PATCH', token: admin, json: { isFirstVisit: null } });
    stored = await call(`/api/admin/repairs/${job.body.id}`, { token: admin });
    expect(stored.body.job.isFirstVisit).toBeNull();
  });

  it('starts with both questions switched off, and an admin can turn them on', async () => {
    let profile = await call('/api/public/cafe');
    expect(profile.body.weighItemsEnabled).toBe(false);
    expect(profile.body.askFirstVisitEnabled).toBe(false);
    let info = await call(`/api/checkin/${checkInToken}`);
    expect(info.body.cafe.weighItemsEnabled).toBe(false);

    const saved = await call('/api/admin/settings/preferences', {
      method: 'PATCH',
      token: admin,
      json: { weighItemsEnabled: true, askFirstVisitEnabled: true },
    });
    expect(saved.status).toBe(200);
    profile = await call('/api/public/cafe');
    expect(profile.body.weighItemsEnabled).toBe(true);
    expect(profile.body.askFirstVisitEnabled).toBe(true);
    info = await call(`/api/checkin/${checkInToken}`);
    expect(info.body.cafe.askFirstVisitEnabled).toBe(true);
  });

  it('refuses a negative weight', async () => {
    const res = await call(`/api/checkin/${checkInToken}/jobs`, {
      json: { customerName: 'Sam Visitor', gdprConsent: true, itemDescription: 'Lamp', faultDescription: 'Dead', weightKg: -1 },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation/failed');
  });
});
