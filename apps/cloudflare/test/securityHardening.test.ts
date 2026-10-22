// The fixes from the security review for 1.13.1. Each block is one finding.
// The restore takeover has its own file, test/restoreGuard.test.ts, because it
// leaves the hub wiped.
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { bytes, TINY_JPEG } from './fixtures.js';
import { call, freshHub, photoForm, setUpHub } from './helpers.js';
import { csvCell } from '../src/lib/csv.js';

beforeAll(freshHub);

const db = () => (env as unknown as { DB: D1Database }).DB;

let superAdmin = '';
let superAdminId = '';
let admin = '';
let repairer = '';
let repairerId = '';
let venueId = '';

function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function makeUser(email: string, role: 'admin' | 'repairer') {
  const user = await call('/api/admin/users', { token: superAdmin, json: { email, displayName: email, role } });
  const signedIn = await call(`/api/auth/reset/${user.body.resetToken}`, { json: { password: 'Soldering1Iron' } });
  return { token: signedIn.body.accessToken as string, id: user.body.user.id as string };
}

async function makeEvent(date: string) {
  const res = await call('/api/admin/events', {
    token: superAdmin,
    json: { name: 'Session', venueId, date, startTime: '10:00', endTime: '13:00', isPublished: true },
  });
  return res.body as { id: string; checkInToken: string };
}

beforeAll(async () => {
  superAdmin = (await setUpHub()).token;
  const users = (await call('/api/admin/users', { token: superAdmin })).body as Array<{ id: string; role: string }>;
  superAdminId = users.find((u) => u.role === 'super_admin')!.id;
  admin = (await makeUser('admin@example.org', 'admin')).token;
  ({ token: repairer, id: repairerId } = await makeUser('fixer@example.org', 'repairer'));
  venueId = (await call('/api/admin/venues', { token: superAdmin })).body[0].id;
});

describe('an admin and a super admin', () => {
  it('stops an admin making a reset link for a super admin, which would sign them in as one', async () => {
    const res = await call(`/api/admin/users/${superAdminId}/reset-link`, { method: 'POST', token: admin });
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });

  it('stops an admin demoting, locking out or re-addressing a super admin', async () => {
    for (const json of [{ role: 'admin' }, { isActive: false }, { email: 'taken@example.org' }]) {
      const res = await call(`/api/admin/users/${superAdminId}`, { method: 'PATCH', token: admin, json });
      expect(res.status, JSON.stringify(json)).toBe(403);
    }
    const row = await db().prepare('SELECT role, is_active, email FROM users WHERE id = ?').bind(superAdminId).first<any>();
    expect(row).toMatchObject({ role: 'super_admin', is_active: 1 });
  });

  it('still lets an admin help a repairer, and a super admin help a super admin', async () => {
    expect((await call(`/api/admin/users/${repairerId}/reset-link`, { method: 'POST', token: admin })).status).toBe(200);
    expect((await call(`/api/admin/users/${superAdminId}/reset-link`, { method: 'POST', token: superAdmin })).status).toBe(200);
  });
});

describe("a visitor's repair at check-in", () => {
  let checkInToken = '';
  let jobId = '';
  let customerToken = '';

  it("needs the visitor's own tracking token to see the repair or add a photo", async () => {
    const event = await makeEvent(daysFromNow(0));
    checkInToken = event.checkInToken;
    await call(`/api/admin/events/${event.id}/activate`, { method: 'POST', token: superAdmin });
    const job = await call(`/api/checkin/${checkInToken}/jobs`, {
      json: { customerName: 'Sam Private', gdprConsent: true, itemDescription: 'Kettle', faultDescription: 'Dead' },
    });
    jobId = job.body.id;
    customerToken = job.body.customerToken;

    // The check-in link and the job id are not secrets. They are not enough.
    const peek = await call(`/api/checkin/${checkInToken}/jobs/${jobId}`);
    expect(peek.status).toBe(404);
    expect(JSON.stringify(peek.body)).not.toContain('Sam Private');
    const own = await call(`/api/checkin/${checkInToken}/jobs/${jobId}`, { headers: { 'x-customer-token': customerToken } });
    expect(own.body.customerName).toBe('Sam Private');
  });

  it('takes at most 3 photos, and only while the item waits', async () => {
    const send = () =>
      call(`/api/checkin/${checkInToken}/jobs/${jobId}/image`, {
        method: 'POST',
        body: photoForm(bytes(TINY_JPEG)),
        headers: { 'x-customer-token': customerToken },
      });
    for (let i = 0; i < 3; i++) expect((await send()).status).toBe(200);
    expect((await send()).body.code).toBe('upload/too_many');

    await db().prepare("DELETE FROM repair_images WHERE repair_job_id = ?").bind(jobId).run();
    await call(`/api/repairer/jobs/${jobId}/accept`, { method: 'PATCH', token: repairer });
    expect((await send()).body.code).toBe('upload/too_late');
  });

  it("never gives the visitor's tracking token to a volunteer", async () => {
    const detail = await call(`/api/repairer/jobs/${jobId}`, { token: repairer });
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).not.toContain(customerToken);

    const finished = await call(`/api/repairer/jobs/${jobId}/complete`, {
      method: 'PATCH',
      token: repairer,
      json: { outcome: 'completed' },
    });
    expect(finished.status).toBe(200);
    expect(JSON.stringify(finished.body)).not.toContain(customerToken);
  });

  it('counts a finished repair once, however often it is saved', async () => {
    const count = async () =>
      (await db().prepare('SELECT repair_count_cache AS n FROM users WHERE id = ?').bind(repairerId).first<{ n: number }>())!.n;
    const before = await count();
    await call(`/api/repairer/jobs/${jobId}/complete`, { method: 'PATCH', token: repairer, json: { outcome: 'completed' } });
    await call(`/api/repairer/jobs/${jobId}/complete`, { method: 'PATCH', token: repairer, json: { outcome: 'completed' } });
    expect(await count()).toBe(before);
  });

  it('refuses a CO2 saving that is negative or far too big', async () => {
    for (const kg of [-5, 20_000, 'lots']) {
      const res = await call(`/api/repairer/jobs/${jobId}/complete`, {
        method: 'PATCH',
        token: repairer,
        json: { outcome: 'completed', environmentalSavingKg: kg },
      });
      expect(res.status, String(kg)).toBe(400);
    }
    const ok = await call(`/api/repairer/jobs/${jobId}/complete`, {
      method: 'PATCH',
      token: repairer,
      json: { outcome: 'completed', environmentalSavingKg: 2.5 },
    });
    expect(ok.status).toBe(200);
  });
});

describe('a pre-registered item', () => {
  it("never gives the visitor's tracking token to the volunteer who takes it", async () => {
    await call('/api/admin/settings/preferences', { method: 'PATCH', token: superAdmin, json: { preRegistrationEnabled: true } });
    const future = await makeEvent(daysFromNow(14));
    const pre = await call(`/api/public/events/${future.id}/pre-register`, {
      json: { customerName: 'Pat Visitor', gdprConsent: true, itemDescription: 'Radio', faultDescription: 'Silent' },
    });
    expect(pre.status).toBe(200);
    const token = pre.body.customerToken as string;

    for (const [path, json] of [
      ['claim', undefined],
      ['notes', { notes: 'Found the manual' }],
      ['release', undefined],
    ] as const) {
      const res = await call(`/api/repairer/pre-registrations/${pre.body.id}/${path}`, { method: 'PATCH', token: repairer, json });
      expect(res.status, path).toBe(200);
      expect(JSON.stringify(res.body), path).not.toContain(token);
    }
  });
});

describe('CSV exports', () => {
  it('turns text that a spreadsheet would run as a formula into plain text', () => {
    expect(csvCell('=HYPERLINK("http://example.org","Click")')).toBe(`"'=HYPERLINK(""http://example.org"",""Click"")"`);
    expect(csvCell('+44 1234')).toBe("'+44 1234");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    // Numbers stay numbers.
    expect(csvCell('-1.5')).toBe('-1.5');
    expect(csvCell(-2)).toBe('-2');
    expect(csvCell('Kettle, white')).toBe('"Kettle, white"');
  });

  it('applies that to what visitors typed, in the repairs export', async () => {
    const event = await makeEvent(daysFromNow(0));
    await call(`/api/admin/events/${event.id}/activate`, { method: 'POST', token: superAdmin });
    await call(`/api/checkin/${event.checkInToken}/jobs`, {
      json: { customerName: '=1+1', gdprConsent: true, itemDescription: 'Lamp', faultDescription: 'Dead' },
    });
    const res = await call('/api/admin/repairs/export.csv', { token: superAdmin });
    expect(res.status).toBe(200);
    const text = await res.raw.text();
    expect(text).toContain("'=1+1");
    expect(text).not.toMatch(/(^|,)=1\+1/m);
  });
});
