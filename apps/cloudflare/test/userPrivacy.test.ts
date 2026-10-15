// No reply may include a password hash. A repair's details name the repairer,
// and the admin user pages show a user, but neither may send the whole row.
import { beforeAll, describe, expect, it } from 'vitest';
import { call, freshHub, setUpHub } from './helpers.js';

beforeAll(freshHub);

let admin = '';
let ada = '';
let adaId = '';
let ben = '';
let jobId = '';

function hasHash(body: unknown): boolean {
  return /passwordHash|password_hash/.test(JSON.stringify(body));
}

beforeAll(async () => {
  admin = (await setUpHub()).token;
  const makeRepairer = async (email: string, displayName: string) => {
    const user = await call('/api/admin/users', { token: admin, json: { email, displayName, role: 'repairer' } });
    expect(hasHash(user.body)).toBe(false);
    const signedIn = await call(`/api/auth/reset/${user.body.resetToken}`, { json: { password: 'Soldering1Iron' } });
    return { token: signedIn.body.accessToken as string, id: user.body.user.id as string };
  };
  ({ token: ada, id: adaId } = await makeRepairer('ada@fix.example', 'Ada Fixwell'));
  ({ token: ben } = await makeRepairer('ben@fix.example', 'Ben Bodge'));

  const venueId = (await call('/api/admin/venues', { token: admin })).body[0].id;
  const event = await call('/api/admin/events', {
    token: admin,
    json: { name: 'Today', venueId, date: new Date().toISOString().slice(0, 10), startTime: '10:00', endTime: '13:00', isPublished: true },
  });
  await call(`/api/admin/events/${event.body.id}/activate`, { method: 'POST', token: admin });
  const job = await call(`/api/checkin/${event.body.checkInToken}/jobs`, {
    json: { customerName: 'Sam', gdprConsent: true, itemDescription: 'Radio', faultDescription: 'Silent' },
  });
  jobId = job.body.id;
  await call(`/api/repairer/jobs/${jobId}/accept`, { method: 'PATCH', token: ada });
});

describe('password hashes stay on the server', () => {
  it('a repair shows who has it, but not their password hash', async () => {
    const asOther = await call(`/api/repairer/jobs/${jobId}`, { token: ben });
    expect(asOther.status).toBe(200);
    expect(asOther.body.repairer).toEqual({ id: adaId, displayName: 'Ada Fixwell', avatarUrl: null });
    expect(hasHash(asOther.body)).toBe(false);

    const asAdmin = await call(`/api/admin/repairs/${jobId}`, { token: admin });
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.repairer.displayName).toBe('Ada Fixwell');
    expect(hasHash(asAdmin.body)).toBe(false);
  });

  it('a repair nobody has taken has no repairer', async () => {
    await call(`/api/repairer/jobs/${jobId}/release`, { method: 'PATCH', token: ada });
    const res = await call(`/api/admin/repairs/${jobId}`, { token: admin });
    expect(res.body.repairer).toBeNull();
  });

  it('the admin user pages do not send it', async () => {
    const one = await call(`/api/admin/users/${adaId}`, { token: admin });
    expect(one.body.displayName).toBe('Ada Fixwell');
    expect(hasHash(one.body)).toBe(false);

    const edited = await call(`/api/admin/users/${adaId}`, { method: 'PATCH', token: admin, json: { bio: 'Kettles' } });
    expect(edited.body.bio).toBe('Kettles');
    expect(hasHash(edited.body)).toBe(false);

    const list = await call('/api/admin/users', { token: admin });
    expect(hasHash(list.body)).toBe(false);
  });
});
