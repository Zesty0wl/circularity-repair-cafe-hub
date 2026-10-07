// The waiting-room display (routes/display.ts) and the dashboard's view of a
// running session.
import { beforeAll, describe, expect, it } from 'vitest';
import { call, freshHub, setUpHub } from './helpers.js';

beforeAll(freshHub);

describe('the waiting-room display', () => {
  let admin = '';
  let repairer = '';
  let eventId = '';

  it('shows a running session without names, and only with the current link', async () => {
    admin = (await setUpHub()).token;
    const venueId = (await call('/api/admin/venues', { token: admin })).body[0].id;
    const date = new Date().toISOString().slice(0, 10);
    const created = await call('/api/admin/events', {
      token: admin,
      json: { name: 'Saturday session', venueId, date, startTime: '10:00', endTime: '13:00', isPublished: true },
    });
    eventId = created.body.id;
    await call(`/api/admin/events/${eventId}/activate`, { method: 'POST', token: admin });

    const checkIn = (item: string, name: string) =>
      call(`/api/checkin/${created.body.checkInToken}/jobs`, {
        json: { customerName: name, customerContact: 'sam@example.org', gdprConsent: true, itemDescription: item, faultDescription: 'Broken' },
      });
    const kettle = await checkIn('Kettle', 'Samantha Secret');
    await checkIn('Lamp', 'Robin Private');

    const user = await call('/api/admin/users', {
      token: admin,
      json: { email: 'fixer@example.org', displayName: 'Ada Fixwell', role: 'repairer' },
    });
    repairer = (await call(`/api/auth/reset/${user.body.resetToken}`, { json: { password: 'Soldering1Iron' } })).body.accessToken;
    await call(`/api/repairer/jobs/${kettle.body.id}/accept`, { method: 'PATCH', token: repairer });

    // The same email twice is a clear refusal, not a server error.
    const twice = await call('/api/admin/users', {
      token: admin,
      json: { email: 'fixer@example.org', displayName: 'Someone Else', role: 'repairer' },
    });
    expect(twice.status).toBe(409);

    // Repairers cannot get the link, admins can.
    expect((await call('/api/admin/display-link', { token: repairer })).status).toBe(403);
    const link = await call('/api/admin/display-link', { token: admin });
    expect(link.status).toBe(200);
    expect(link.body.path).toBe(`/display/${link.body.token}`);
    // Asking again gives the same link.
    expect((await call('/api/admin/display-link', { token: admin })).body.token).toBe(link.body.token);

    const shown = await call(`/api/display/${link.body.token}`);
    expect(shown.status).toBe(200);
    expect(shown.body.sessions[0].name).toBe('Saturday session');
    expect(shown.body.sessions[0].qrCodeUrl).toMatch(/^\/uploads\/qr\//);
    expect(shown.body.jobs.map((j: any) => [j.item, j.status])).toEqual([
      ['Kettle', 'in_progress'],
      ['Lamp', 'waiting'],
    ]);
    expect(shown.body.jobs[0].repairerFirstName).toBe('Ada');
    expect(shown.body.today.checkedIn).toBe(2);
    // Nothing personal reaches the screen.
    const text = JSON.stringify(shown.body);
    for (const secret of ['Samantha', 'Robin', 'sam@example.org', 'Fixwell', 'customer']) {
      expect(text).not.toContain(secret);
    }

    expect((await call('/api/display/not-the-right-token-at-all')).status).toBe(404);

    // Replacing the link stops the old one working.
    const replaced = await call('/api/admin/display-link/regenerate', { method: 'POST', token: admin });
    expect(replaced.body.token).not.toBe(link.body.token);
    expect((await call(`/api/display/${link.body.token}`)).status).toBe(404);
    expect((await call(`/api/display/${replaced.body.token}`)).status).toBe(200);
  });

  it('gives the dashboard the running queue, the next sessions and paused repairs', async () => {
    const dash = await call('/api/admin/dashboard', { token: admin });
    expect(dash.status).toBe(200);
    expect(dash.body.activeJobs.map((j: any) => j.itemDescription)).toEqual(['Kettle', 'Lamp']);
    expect(dash.body.activeJobs[0].repairerName).toBe('Ada Fixwell');
    expect(Array.isArray(dash.body.upcomingEvents)).toBe(true);
    expect(dash.body.awaitingReturn).toEqual([]);

    const queue = await call('/api/repairer/active-event', { token: repairer });
    const kettle = queue.body.jobs.find((j: any) => j.itemDescription === 'Kettle');
    expect(kettle.acceptedAt).toBeTruthy();
    expect('categoryId' in kettle).toBe(true);
  });
});
