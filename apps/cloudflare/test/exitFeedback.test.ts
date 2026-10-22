// The visitor's verdict at the exit: recorded by a volunteer on the job, and
// counted in the stats. See migrations/0005_exit_satisfaction.ts.
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { call, freshHub, setUpHub } from './helpers.js';

beforeAll(freshHub);

describe('exit satisfaction', () => {
  let admin = '';
  let repairer = '';
  let jobId = '';

  it('records what the visitor said and counts it', async () => {
    admin = (await setUpHub()).token;
    const venueId = (await call('/api/admin/venues', { token: admin })).body[0].id;
    const date = new Date().toISOString().slice(0, 10);
    const created = await call('/api/admin/events', {
      token: admin,
      json: { name: 'Saturday session', venueId, date, startTime: '10:00', endTime: '13:00', isPublished: true },
    });
    await call(`/api/admin/events/${created.body.id}/activate`, { method: 'POST', token: admin });

    const checkIn = await call(`/api/checkin/${created.body.checkInToken}/jobs`, {
      json: { customerName: 'Sam Visitor', gdprConsent: true, itemDescription: 'Kettle', faultDescription: 'No power' },
    });
    jobId = checkIn.body.id;

    const user = await call('/api/admin/users', {
      token: admin,
      json: { email: 'fixer@example.org', displayName: 'Ada Fixwell', role: 'repairer' },
    });
    repairer = (await call(`/api/auth/reset/${user.body.resetToken}`, { json: { password: 'Soldering1Iron' } })).body
      .accessToken;

    await call(`/api/repairer/jobs/${jobId}/accept`, { method: 'PATCH', token: repairer });
    await call(`/api/repairer/jobs/${jobId}/complete`, { method: 'PATCH', token: repairer, json: { outcome: 'completed' } });

    // The question starts switched off, and the route says so.
    const off = await call(`/api/repairer/jobs/${jobId}/feedback`, {
      method: 'PATCH',
      token: repairer,
      json: { satisfaction: 'satisfied' },
    });
    expect(off.status).toBe(404);
    expect(off.body.code).toBe('feedback/off');
    await call('/api/admin/settings/preferences', { method: 'PATCH', token: admin, json: { askSatisfactionEnabled: true } });

    // Nobody has answered yet, so the rate is null, not a misleading zero.
    let stats = await call('/api/admin/stats/overview', { token: admin });
    expect(stats.body.satisfactionRate).toBeNull();
    expect(stats.body.satisfactionCount).toBe(0);

    const saved = await call(`/api/repairer/jobs/${jobId}/feedback`, {
      method: 'PATCH',
      token: repairer,
      json: { satisfaction: 'satisfied', satisfactionComment: 'Very happy' },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.satisfaction).toBe('satisfied');
    expect(saved.body.satisfactionComment).toBe('Very happy');

    stats = await call('/api/admin/stats/overview', { token: admin });
    expect(stats.body.satisfactionRate).toBe(100);
    expect(stats.body.satisfactionCount).toBe(1);
  });

  it('can be changed and cleared, and refuses a value that is not one of the two', async () => {
    const bad = await call(`/api/repairer/jobs/${jobId}/feedback`, {
      method: 'PATCH',
      token: repairer,
      json: { satisfaction: 'meh' },
    });
    expect(bad.status).toBe(400);

    const changed = await call(`/api/repairer/jobs/${jobId}/feedback`, {
      method: 'PATCH',
      token: repairer,
      json: { satisfaction: 'not_satisfied' },
    });
    expect(changed.body.satisfaction).toBe('not_satisfied');

    const cleared = await call(`/api/repairer/jobs/${jobId}/feedback`, {
      method: 'PATCH',
      token: repairer,
      json: { satisfaction: null },
    });
    expect(cleared.body.satisfaction).toBeNull();
  });

  it('removes the comment with the other personal details when they expire', async () => {
    await call(`/api/repairer/jobs/${jobId}/feedback`, {
      method: 'PATCH',
      token: repairer,
      json: { satisfaction: 'satisfied', satisfactionComment: 'Thanks, call me on 07700 900123' },
    });
    const db = (env as unknown as { DB: D1Database }).DB;
    await db.prepare("UPDATE repair_jobs SET data_retention_date = '2000-01-01' WHERE id = ?").bind(jobId).run();

    const res = await call('/api/admin/repairs/purge-expired-pii', { method: 'POST', token: admin });
    expect(res.status).toBe(200);
    const row = await db
      .prepare('SELECT customer_name, satisfaction, satisfaction_comment FROM repair_jobs WHERE id = ?')
      .bind(jobId)
      .first<{ customer_name: string | null; satisfaction: string | null; satisfaction_comment: string | null }>();
    expect(row?.customer_name).toBeNull();
    expect(row?.satisfaction_comment).toBeNull();
    // The answer itself is not personal, so it stays for the statistics.
    expect(row?.satisfaction).toBe('satisfied');
  });
});
