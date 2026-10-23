// PAT testing and pre-registration (routes/preRegistration.ts, the PAT parts
// of routes/repairer.ts). Both are off on a new hub, and while they are off
// the hub must behave exactly as before.
import { beforeAll, describe, expect, it } from 'vitest';
import { call, freshHub, setUpHub } from './helpers.js';

beforeAll(freshHub);

let admin = '';
let ada = '';
let adaId = '';
let ben = '';
let venueId = '';
let electronicsId = '';
let toysId = '';

/** A date a number of days from today, as 'YYYY-MM-DD'. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function makeRepairer(email: string, displayName: string): Promise<{ token: string; id: string }> {
  const user = await call('/api/admin/users', { token: admin, json: { email, displayName, role: 'repairer' } });
  const signedIn = await call(`/api/auth/reset/${user.body.resetToken}`, { json: { password: 'Soldering1Iron' } });
  return { token: signedIn.body.accessToken, id: user.body.user.id };
}

async function makeEvent(fields: Record<string, unknown>) {
  const res = await call('/api/admin/events', {
    token: admin,
    json: { name: 'Session', venueId, startTime: '10:00', endTime: '13:00', isPublished: true, ...fields },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as { id: string; checkInToken: string };
}

function checkIn(token: string, item: string, categoryId: string | null) {
  return call(`/api/checkin/${token}/jobs`, {
    json: { customerName: 'Sam', gdprConsent: true, itemDescription: item, faultDescription: 'Broken', itemCategoryId: categoryId },
  });
}

function setPreferences(json: Record<string, unknown>) {
  return call('/api/admin/settings/preferences', { method: 'PATCH', token: admin, json });
}

beforeAll(async () => {
  admin = (await setUpHub()).token;
  venueId = (await call('/api/admin/venues', { token: admin })).body[0].id;
  const cats = (await call('/api/public/skill-categories')).body as Array<{ id: string; name: string; isElectrical: boolean }>;
  electronicsId = cats.find((c) => c.name === 'Electronics')!.id;
  toysId = cats.find((c) => c.name === 'Toys')!.id;
  ({ token: ada, id: adaId } = await makeRepairer('ada@fix.example', 'Ada Fixwell'));
  ({ token: ben } = await makeRepairer('ben@fix.example', 'Ben Bodge'));
});

describe('with both switched off', () => {
  it('starts off, and changes nothing', async () => {
    const cafe = (await call('/api/public/cafe')).body;
    expect(cafe.preRegistrationEnabled).toBe(false);
    expect(cafe.patTestingEnabled).toBe(false);

    const cats = (await call('/api/public/skill-categories')).body as Array<{ name: string; isElectrical: boolean }>;
    expect(cats.filter((c) => c.isElectrical).map((c) => c.name).sort()).toEqual(['Electronics', 'Small appliances']);

    const future = await makeEvent({ name: 'Next month', date: daysFromNow(30) });
    expect((await call(`/api/public/events/${future.id}`)).body.preRegistration).toBeNull();
    const pre = await call(`/api/public/events/${future.id}/pre-register`, {
      json: { customerName: 'Sam', gdprConsent: true, itemDescription: 'Radio', faultDescription: 'Silent' },
    });
    expect(pre.status).toBe(404);
    expect((await call('/api/repairer/pre-registrations', { token: ada })).status).toBe(404);

    const today = await makeEvent({ name: 'Today', date: daysFromNow(0) });
    await call(`/api/admin/events/${today.id}/activate`, { method: 'POST', token: admin });
    const radio = await checkIn(today.checkInToken, 'Radio', electronicsId);
    await call(`/api/repairer/jobs/${radio.body.id}/accept`, { method: 'PATCH', token: ada });

    const queue = (await call('/api/repairer/active-event', { token: ada })).body;
    expect(queue.jobs[0].needsPat).toBe(false);
    expect((await call(`/api/repairer/jobs/${radio.body.id}`, { token: ada })).body.pat).toBeNull();
    expect((await call(`/api/repairer/jobs/${radio.body.id}/pat`, { method: 'PATCH', token: ada, json: { result: 'pass' } })).status).toBe(404);

    // An electrical item finishes without a PAT test, as it always has.
    const done = await call(`/api/repairer/jobs/${radio.body.id}/complete`, { method: 'PATCH', token: ada, json: { outcome: 'completed' } });
    expect(done.status).toBe(200);
    expect(done.body.patResult).toBeNull();

    const csv = await call('/api/admin/repairs/export.csv', { token: admin });
    expect((await csv.raw.text()).split('\n')[0]).not.toContain('pat');

    await call(`/api/admin/events/${today.id}/complete`, { method: 'POST', token: admin });
  });
});

describe('PAT testing', () => {
  let session = { id: '', checkInToken: '' };

  it('picks out electrical items in the queue', async () => {
    expect((await setPreferences({ patTestingEnabled: true })).status).toBe(200);
    expect((await call('/api/public/cafe')).body.patTestingEnabled).toBe(true);
    session = await makeEvent({ name: 'PAT day', date: daysFromNow(0) });
    await call(`/api/admin/events/${session.id}/activate`, { method: 'POST', token: admin });
    await checkIn(session.checkInToken, 'Toaster', electronicsId);
    await checkIn(session.checkInToken, 'Teddy bear', toysId);
    const queue = (await call('/api/repairer/active-event', { token: ada })).body;
    const byItem = Object.fromEntries(queue.jobs.map((j: any) => [j.itemDescription, j]));
    expect(byItem['Toaster'].needsPat).toBe(true);
    expect(byItem['Teddy bear'].needsPat).toBe(false);
  });

  it('will not mark an electrical item as fixed without a passing PAT test', async () => {
    const queue = (await call('/api/repairer/active-event', { token: ada })).body;
    const toaster = queue.jobs.find((j: any) => j.itemDescription === 'Toaster');
    await call(`/api/repairer/jobs/${toaster.id}/accept`, { method: 'PATCH', token: ada });

    const without = await call(`/api/repairer/jobs/${toaster.id}/complete`, { method: 'PATCH', token: ada, json: { outcome: 'completed' } });
    expect(without.status).toBe(400);
    expect(without.body.code).toBe('pat/required');

    const failed = await call(`/api/repairer/jobs/${toaster.id}/complete`, {
      method: 'PATCH',
      token: ada,
      json: { outcome: 'completed', pat: { result: 'fail' } },
    });
    expect(failed.status).toBe(400);
    expect(failed.body.code).toBe('pat/failed');

    // Somebody else's repair is not theirs to test.
    expect((await call(`/api/repairer/jobs/${toaster.id}/pat`, { method: 'PATCH', token: ben, json: { result: 'pass' } })).status).toBe(403);
    expect((await call(`/api/repairer/jobs/${toaster.id}/pat`, { method: 'PATCH', token: ada, json: { result: 'maybe' } })).status).toBe(400);

    const before = Date.now();
    const passed = await call(`/api/repairer/jobs/${toaster.id}/complete`, {
      method: 'PATCH',
      token: ada,
      json: { outcome: 'completed', pat: { result: 'pass', notes: 'Earth bond fine' } },
    });
    expect(passed.status).toBe(200);
    expect(passed.body.patResult).toBe('pass');
    expect(passed.body.patNotes).toBe('Earth bond fine');
    expect(passed.body.patTestedBy).toBe(adaId);
    expect(new Date(passed.body.patTestedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);

    const detail = (await call(`/api/admin/repairs/${toaster.id}`, { token: admin })).body;
    expect(detail.pat).toMatchObject({ needed: true, result: 'pass', testedByName: 'Ada Fixwell' });
    const csv = await (await call('/api/admin/repairs/export.csv', { token: admin })).raw.text();
    expect(csv.split('\n')[0]).toContain('patResult,patTestedAt,patTestedBy');
    expect(csv).toContain('pass');
  });

  it('lets the repairer say one item is electrical, whatever its category', async () => {
    const queue = (await call('/api/repairer/active-event', { token: ada })).body;
    const bear = queue.jobs.find((j: any) => j.itemDescription === 'Teddy bear');
    await call(`/api/repairer/jobs/${bear.id}/accept`, { method: 'PATCH', token: ada });
    expect((await call(`/api/repairer/jobs/${bear.id}/electrical`, { method: 'PATCH', token: ada, json: { isElectrical: 'yes' } })).status).toBe(400);
    expect((await call(`/api/repairer/jobs/${bear.id}/electrical`, { method: 'PATCH', token: ada, json: { isElectrical: true } })).status).toBe(200);

    const detail = (await call(`/api/repairer/jobs/${bear.id}`, { token: ada })).body;
    expect(detail.pat).toMatchObject({ needed: true, itemIsElectrical: true, categoryIsElectrical: false, result: null });
    expect((await call(`/api/repairer/jobs/${bear.id}/complete`, { method: 'PATCH', token: ada, json: { outcome: 'completed' } })).body.code).toBe('pat/required');

    // Recorded on its own, before finishing.
    const recorded = await call(`/api/repairer/jobs/${bear.id}/pat`, { method: 'PATCH', token: ada, json: { result: 'not_needed', notes: 'Battery only' } });
    expect(recorded.status).toBe(200);
    expect(recorded.body.patResult).toBe('not_needed');
    expect((await call(`/api/repairer/jobs/${bear.id}/complete`, { method: 'PATCH', token: ada, json: { outcome: 'completed' } })).status).toBe(200);
  });

  it('does not ask for a PAT test when the item could not be fixed', async () => {
    const lamp = await checkIn(session.checkInToken, 'Lamp', electronicsId);
    await call(`/api/repairer/jobs/${lamp.body.id}/accept`, { method: 'PATCH', token: ben });
    const res = await call(`/api/repairer/jobs/${lamp.body.id}/complete`, { method: 'PATCH', token: ben, json: { outcome: 'cannot_repair' } });
    expect(res.status).toBe(200);
    await call(`/api/admin/events/${session.id}/complete`, { method: 'POST', token: admin });
  });
});

describe('pre-registration', () => {
  let event = { id: '', checkInToken: '' };
  let visitorToken = '';
  let radioId = '';
  let clockId = '';

  it('takes items for a session that has not started', async () => {
    expect((await setPreferences({ preRegistrationEnabled: true })).status).toBe(200);
    event = await makeEvent({ name: 'Next week', date: daysFromNow(7) });
    expect((await call(`/api/public/events/${event.id}`)).body.preRegistration).toEqual({ open: true, askContact: true });

    const radio = await call(`/api/public/events/${event.id}/pre-register`, {
      json: {
        customerName: 'Priya',
        customerContact: 'priya@example.org',
        gdprConsent: true,
        itemDescription: 'Roberts radio',
        itemBrand: 'Roberts',
        faultDescription: 'Crackles on FM',
        itemCategoryId: electronicsId,
      },
    });
    expect(radio.status, JSON.stringify(radio.body)).toBe(200);
    visitorToken = radio.body.customerToken;
    radioId = radio.body.id;

    // A second item with the same token needs no name again.
    const clock = await call(`/api/public/events/${event.id}/pre-register`, {
      json: { customerToken: visitorToken, itemDescription: 'Clock', faultDescription: 'Stopped', itemCategoryId: toysId },
    });
    expect(clock.status).toBe(200);
    expect(clock.body.customerToken).toBe(visitorToken);
    clockId = clock.body.id;

    const unknown = await call(`/api/public/events/${event.id}/pre-register`, {
      json: { customerToken: 'not-a-real-token-at-all', itemDescription: 'Fan', faultDescription: 'Noisy' },
    });
    expect(unknown.status).toBe(400);
    const noConsent = await call(`/api/public/events/${event.id}/pre-register`, {
      json: { customerName: 'Pat', itemDescription: 'Fan', faultDescription: 'Noisy' },
    });
    expect(noConsent.status).toBe(400);

    const track = (await call(`/api/track/${visitorToken}`)).body;
    expect(track.customerName).toBe('Priya');
    expect(track.event.id).toBe(event.id);
    expect(track.jobs).toEqual([]);
    expect(track.preRegistrations.map((p: any) => [p.itemDescription, p.status])).toEqual([
      ['Roberts radio', 'open'],
      ['Clock', 'open'],
    ]);
    // Nothing personal on the public link beyond the visitor's own name.
    expect(JSON.stringify(track)).not.toContain('priya@example.org');
  });

  it('refuses sessions that are unpublished, full or running', async () => {
    const hidden = await makeEvent({ name: 'Hidden', date: daysFromNow(7), isPublished: false });
    const toHidden = await call(`/api/public/events/${hidden.id}/pre-register`, {
      json: { customerName: 'Sam', gdprConsent: true, itemDescription: 'Fan', faultDescription: 'Noisy' },
    });
    expect(toHidden.status).toBe(404);

    const small = await makeEvent({ name: 'Small', date: daysFromNow(14), maxItems: 1 });
    const item = { customerName: 'Sam', gdprConsent: true, itemDescription: 'Fan', faultDescription: 'Noisy' };
    expect((await call(`/api/public/events/${small.id}/pre-register`, { json: item })).status).toBe(200);
    const second = await call(`/api/public/events/${small.id}/pre-register`, { json: item });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('preregistration/full');

    // A session with an item pre-registered cannot be deleted, only cancelled.
    const del = await call(`/api/admin/events/${small.id}`, { method: 'DELETE', token: admin });
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('event/has_pre_registrations');
  });

  it('lets a repairer take an item and make notes before the day', async () => {
    const list = (await call('/api/repairer/pre-registrations', { token: ada })).body.items as any[];
    const radio = list.find((i) => i.id === radioId);
    expect(radio).toMatchObject({ itemDescription: 'Roberts radio', customerFirstName: 'Priya', needsPat: true, repairerId: null });
    expect(JSON.stringify(list)).not.toContain('priya@example.org');

    expect((await call(`/api/repairer/pre-registrations/${radioId}/notes`, { method: 'PATCH', token: ada, json: { researchNotes: 'x' } })).status).toBe(403);
    expect((await call(`/api/repairer/pre-registrations/${radioId}/claim`, { method: 'PATCH', token: ada })).status).toBe(200);
    const notes = await call(`/api/repairer/pre-registrations/${radioId}/notes`, {
      method: 'PATCH',
      token: ada,
      json: { researchNotes: 'Schematic is on the Roberts site. Likely a dry joint.' },
    });
    expect(notes.status).toBe(200);
    expect((await call(`/api/repairer/pre-registrations/${radioId}/notes`, { method: 'PATCH', token: ben, json: { researchNotes: 'mine' } })).status).toBe(403);

    const mine = (await call('/api/repairer/pre-registrations', { token: ada })).body.items.find((i: any) => i.id === radioId);
    expect(mine).toMatchObject({ isMine: true, hasNotes: true, repairerName: 'Ada Fixwell' });
    expect((await call(`/api/track/${visitorToken}`)).body.preRegistrations[0].repairerFirstName).toBe('Ada');

    // No repair exists yet, and nothing can be checked in before the session runs.
    expect((await call('/api/admin/repairs?search=Roberts', { token: admin })).body.meta.total).toBe(0);
    const early = await call(`/api/repairer/pre-registrations/${radioId}/check-in`, { method: 'POST', token: ada });
    expect(early.status).toBe(400);
    expect(early.body.code).toBe('event/not_active');
  });

  it('lets a volunteer say whether an item needs a PAT test before the day', async () => {
    const url = (id: string) => `/api/repairer/pre-registrations/${id}/electrical`;
    // Only the repairer who took it, or an admin, can change it.
    expect((await call(url(radioId), { method: 'PATCH', token: ben, json: { isElectrical: false } })).status).toBe(403);
    expect((await call(url(radioId), { method: 'PATCH', token: ada, json: { isElectrical: 'no' } })).status).toBe(400);

    // A battery radio in an electrical category.
    expect((await call(url(radioId), { method: 'PATCH', token: ada, json: { isElectrical: false } })).status).toBe(200);
    let detail = (await call(`/api/repairer/pre-registrations/${radioId}`, { token: ada })).body;
    expect(detail.needsPat).toBe(false);
    expect(detail.pat).toEqual({ needed: false, itemIsElectrical: false, categoryIsElectrical: true });
    const listed = (await call('/api/repairer/pre-registrations', { token: ada })).body.items.find((i: any) => i.id === radioId);
    expect(listed.needsPat).toBe(false);

    // Null follows the category again.
    expect((await call(url(radioId), { method: 'PATCH', token: ada, json: { isElectrical: null } })).status).toBe(200);
    detail = (await call(`/api/repairer/pre-registrations/${radioId}`, { token: ada })).body;
    expect(detail.pat).toEqual({ needed: true, itemIsElectrical: null, categoryIsElectrical: true });

    // An admin can change an item nobody has taken.
    expect((await call(url(clockId), { method: 'PATCH', token: admin, json: { isElectrical: true } })).status).toBe(200);
    expect((await call(`/api/repairer/pre-registrations/${clockId}`, { token: ada })).body.needsPat).toBe(true);
  });

  it('lets the visitor call an item off', async () => {
    const extra = await call(`/api/public/events/${event.id}/pre-register`, {
      json: { customerToken: visitorToken, itemDescription: 'Hairdryer', faultDescription: 'Smells hot' },
    });
    expect((await call(`/api/track/someone-elses-token/pre-registrations/${extra.body.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await call(`/api/track/${visitorToken}/pre-registrations/${extra.body.id}`, { method: 'DELETE' })).status).toBe(200);
    const statuses = (await call(`/api/track/${visitorToken}`)).body.preRegistrations.map((p: any) => p.status);
    expect(statuses).toEqual(['open', 'open', 'cancelled']);
  });

  it('starts the repair clock only when the item is checked in on the day', async () => {
    await call(`/api/admin/events/${event.id}/activate`, { method: 'POST', token: admin });
    expect((await call(`/api/public/events/${event.id}`)).body.preRegistration).toEqual({ open: false, askContact: true });
    const late = await call(`/api/public/events/${event.id}/pre-register`, {
      json: { customerToken: visitorToken, itemDescription: 'Kettle', faultDescription: 'Leaks' },
    });
    expect(late.status).toBe(400);
    expect(late.body.code).toBe('preregistration/closed');

    const waiting = await call(`/api/checkin/${event.checkInToken}/pre-registrations?customerToken=${visitorToken}`);
    expect(waiting.body).toEqual({
      customerName: 'Priya',
      items: [
        { id: radioId, itemDescription: 'Roberts radio', itemBrand: 'Roberts' },
        { id: clockId, itemDescription: 'Clock', itemBrand: null },
      ],
    });

    const before = Date.now();
    const arrived = await call(`/api/checkin/${event.checkInToken}/arrive`, { json: { customerToken: visitorToken } });
    expect(arrived.status).toBe(200);
    expect(arrived.body.jobs.map((j: any) => [j.itemDescription, j.status])).toEqual([
      ['Roberts radio', 'in_progress'],
      ['Clock', 'waiting'],
    ]);
    const radioJob = arrived.body.jobs[0];
    expect(radioJob.jobNumber).toMatch(/^\d{4}-\d{4}$/);

    // The radio went straight to Ada, timed from check-in.
    const detail = (await call(`/api/repairer/jobs/${radioJob.id}`, { token: ada })).body;
    expect(detail.job.repairerId).toBe(adaId);
    expect(detail.job.acceptedAt).toBe(detail.job.createdAt);
    expect(new Date(detail.job.acceptedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(detail.job.customerContact).toBe('priya@example.org');
    expect(detail.preRegistration.researchNotes).toContain('dry joint');
    expect(detail.pat.needed).toBe(true);

    // The clock keeps the setting it was given before the day.
    const clockPat = (await call(`/api/repairer/jobs/${arrived.body.jobs[1].id}`, { token: admin })).body.pat;
    expect(clockPat).toMatchObject({ needed: true, itemIsElectrical: true, categoryIsElectrical: false });
    expect((await call(`/api/repairer/pre-registrations/${clockId}/electrical`, { method: 'PATCH', token: admin, json: { isElectrical: false } })).status).toBe(409);

    // Arriving twice changes nothing.
    expect((await call(`/api/checkin/${event.checkInToken}/arrive`, { json: { customerToken: visitorToken } })).body.jobs).toEqual([]);
    const track = (await call(`/api/track/${visitorToken}`)).body;
    expect(track.jobs).toHaveLength(2);
    expect(track.preRegistrations.map((p: any) => p.status)).toEqual(['cancelled']);

    // The same token adds another item at the door, as for any visitor.
    const extra = await call(`/api/checkin/${event.checkInToken}/jobs`, {
      json: { customerToken: visitorToken, itemDescription: 'Torch', faultDescription: 'Dim' },
    });
    expect(extra.status).toBe(200);
  });

  it('lets a volunteer check an item in at the welcome desk', async () => {
    // Pre-registered before the session started, by somebody else.
    const later = await makeEvent({ name: 'Later', date: daysFromNow(21) });
    const fan = await call(`/api/public/events/${later.id}/pre-register`, {
      json: { customerName: 'Omar', gdprConsent: true, itemDescription: 'Desk fan', faultDescription: 'Will not spin' },
    });
    // It belongs to a session that is not running, so it cannot be checked in.
    expect((await call(`/api/repairer/pre-registrations/${fan.body.id}/check-in`, { method: 'POST', token: ben })).status).toBe(400);
    // Repairers cannot cancel it, admins can.
    expect((await call(`/api/repairer/pre-registrations/${fan.body.id}/cancel`, { method: 'PATCH', token: ben })).status).toBe(403);

    const desk = (await call('/api/repairer/pre-registrations-today', { token: ben })).body;
    expect(desk.event.id).toBe(event.id);
    expect(desk.items).toEqual([]);

    await call(`/api/admin/events/${event.id}/complete`, { method: 'POST', token: admin });
    await call(`/api/admin/events/${later.id}/activate`, { method: 'POST', token: admin });
    const today = (await call('/api/repairer/pre-registrations-today', { token: ben })).body;
    expect(today.items.map((i: any) => [i.customerName, i.itemDescription])).toEqual([['Omar', 'Desk fan']]);
    const checked = await call(`/api/repairer/pre-registrations/${fan.body.id}/check-in`, { method: 'POST', token: ben });
    expect(checked.status).toBe(200);
    expect(checked.body.status).toBe('waiting');
    expect(checked.body.repairerId).toBeNull();
    expect((await call(`/api/repairer/pre-registrations/${fan.body.id}/check-in`, { method: 'POST', token: ben })).status).toBe(409);
  });

  it('removes expired personal details from pre-registrations too', async () => {
    const res = await call('/api/admin/repairs/purge-expired-pii', { token: admin, json: {} });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('preRegistrations', 0);
  });

  it('hides everything again when switched off', async () => {
    await setPreferences({ preRegistrationEnabled: false });
    expect((await call('/api/repairer/pre-registrations', { token: ada })).status).toBe(404);
    expect((await call('/api/repairer/pre-registrations-today', { token: ada })).status).toBe(404);
  });
});
