// The ORDS export: one row per repair attempt, with the Open Repair Data
// Standard's field names and repair_status codes.
// See https://standard.openrepair.org/ (sections 3.4.1 and 3.4.3).
import { beforeAll, describe, expect, it } from 'vitest';
import { call, freshHub, setUpHub } from './helpers.js';

beforeAll(freshHub);

const HEADER =
  'id,partner_product_category,product_category,brand,year_of_manufacture,problem,repair_status,repair_barrier_if_end_of_life,group_identifier,event_date,data_provider,country';

describe('the ORDS export', () => {
  let admin = '';
  let repairer = '';

  it('exports finished attempts with ORDS field names and status codes', async () => {
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

    const checkIn = (item: string) =>
      call(`/api/checkin/${created.body.checkInToken}/jobs`, {
        json: { customerName: 'Sam Visitor', gdprConsent: true, itemDescription: item, faultDescription: 'No power' },
      });

    const fixed = await checkIn('Kettle');
    const dead = await checkIn('Toaster');
    await checkIn('Lamp'); // left waiting, so it must not appear

    await call(`/api/repairer/jobs/${fixed.body.id}/accept`, { method: 'PATCH', token: repairer });
    await call(`/api/repairer/jobs/${fixed.body.id}/complete`, { method: 'PATCH', token: repairer, json: { outcome: 'completed' } });
    await call(`/api/repairer/jobs/${dead.body.id}/accept`, { method: 'PATCH', token: repairer });
    await call(`/api/repairer/jobs/${dead.body.id}/complete`, { method: 'PATCH', token: repairer, json: { outcome: 'cannot_repair' } });

    const res = await call('/api/admin/repairs/export.ords.csv', { token: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');

    const lines = (await res.raw.text()).trim().split('\n');
    expect(lines[0]).toBe(HEADER);

    const header = lines[0].split(',');
    const statusAt = header.indexOf('repair_status');
    const eventDateAt = header.indexOf('event_date');
    const rows = lines.slice(1).map((l) => l.split(','));

    // The waiting job is not an attempt yet, so only the two finished jobs appear.
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r[statusAt]).sort()).toEqual(['1', '3']); // Fixed, End of life
    expect(rows[0][eventDateAt]).toBe(date);
  });

  it('takes the country from Settings', async () => {
    const bad = await call('/api/admin/settings', { method: 'PATCH', token: admin, json: { ordsCountry: 'France' } });
    expect(bad.status).toBe(400);
    const saved = await call('/api/admin/settings', { method: 'PATCH', token: admin, json: { ordsCountry: 'fra' } });
    expect(saved.status).toBe(200);
    expect(saved.body.ordsCountry).toBe('FRA');

    const res = await call('/api/admin/repairs/export.ords.csv', { token: admin });
    const lines = (await res.raw.text()).trim().split('\n');
    const countryAt = lines[0].split(',').indexOf('country');
    expect(lines.slice(1).map((l) => l.split(',')[countryAt])).toEqual(['FRA', 'FRA']);
  });

  it('is refused without an admin', async () => {
    const res = await call('/api/admin/repairs/export.ords.csv', { token: repairer });
    expect(res.status).toBe(403);
  });
});
