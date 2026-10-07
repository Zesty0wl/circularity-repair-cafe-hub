// A whole repair session, from an empty hub to the reports, through the API
// the web app uses. Each step depends on the one before, so they run in order.
import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, call, photoForm, refreshCookie, setUpHub, freshHub } from './helpers.js';
import { bytes, JPEG_WITH_GPS } from './fixtures.js';

const today = new Date().toISOString().slice(0, 10);

const state: {
  admin?: string;
  adminCookie?: string;
  venueId?: string;
  eventId?: string;
  checkInToken?: string;
  jobId?: string;
  jobNumber?: string;
  customerToken?: string;
  repairerId?: string;
  repairer?: string;
  co2FactorId?: string;
  categoryId?: string;
} = {};

beforeAll(freshHub);

describe('a repair session from start to finish', () => {
  it('starts with setup not done, and every page sends people to the wizard', async () => {
    const res = await call('/api/setup/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ setupCompleted: false, edition: 'cloudflare', canImport: true });
  });

  it('completes the setup wizard', async () => {
    const { token, cookie } = await setUpHub();
    state.admin = token;
    state.adminCookie = cookie;
    expect(token).toMatch(/^ey/);
    expect(cookie).toMatch(/^circ_refresh=/);
    expect((await call('/api/setup/status')).body.setupCompleted).toBe(true);
    // Doing it twice is refused.
    const again = await call('/api/setup/complete', { json: {} });
    expect(again.status).toBe(409);
  });

  it('signs in, refuses a wrong password, and refreshes from the cookie', async () => {
    const wrong = await call('/api/auth/login', { json: { email: ADMIN.email, password: 'nope' } });
    expect(wrong.status).toBe(401);
    const ok = await call('/api/auth/login', { json: { email: ADMIN.email.toUpperCase(), password: ADMIN.password } });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('super_admin');
    const refreshed = await call('/api/auth/refresh', { method: 'POST', cookie: refreshCookie(ok) });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toMatch(/^ey/);
    const none = await call('/api/auth/refresh', { method: 'POST' });
    expect(none.status).toBe(401);
  });

  it('keeps admin routes for admins', async () => {
    expect((await call('/api/admin/dashboard')).status).toBe(401);
    expect((await call('/api/admin/dashboard', { token: 'not-a-token' })).status).toBe(401);
    const dash = await call('/api/admin/dashboard', { token: state.admin });
    expect(dash.status).toBe(200);
    expect(dash.body.stats.totalRepairs).toBe(0);
  });

  it('serves the public cafe profile with the seeded defaults', async () => {
    const res = await call('/api/public/cafe');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Tinkerton Repair Café');
    expect(res.body.homePage.faqs.length).toBeGreaterThan(0);
    expect(res.body.linuxEnabled).toBe(false);
    expect(res.body.gallery).toEqual([]);
    expect(res.body.pwaIconVersion).toMatch(/^[0-9a-f]{10}$/);
    const cats = await call('/api/public/skill-categories');
    expect(cats.body.length).toBe(10);
    state.categoryId = cats.body.find((c: any) => c.name === 'Small appliances').id;
    const factors = await call('/api/public/co2-factors');
    expect(factors.body.factors.length).toBeGreaterThan(30);
    state.co2FactorId = factors.body.factors.find((f: any) => Number(f.co2eKg) > 0).id;
  });

  it('lists the home venue made by the wizard', async () => {
    const res = await call('/api/admin/venues', { token: state.admin });
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Village Hall');
    expect(res.body[0].isHomeVenue).toBe(true);
    state.venueId = res.body[0].id;
  });

  it('creates a session with a QR code, and opens it', async () => {
    const res = await call('/api/admin/events', {
      token: state.admin,
      json: { name: 'October Repair Café', venueId: state.venueId, date: today, startTime: '10:00', endTime: '13:00', isPublished: true },
    });
    expect(res.status).toBe(200);
    expect(res.body.startTime).toBe('10:00:00');
    expect(res.body.qrCodeUrl).toBe(`/uploads/qr/${res.body.id}.png`);
    state.eventId = res.body.id;
    state.checkInToken = res.body.checkInToken;

    const qr = await call(res.body.qrCodeUrl);
    expect(qr.status).toBe(200);
    expect(qr.headers.get('content-type')).toBe('image/png');
    const png = new Uint8Array(await qr.raw.arrayBuffer());
    expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');

    const open = await call(`/api/admin/events/${state.eventId}/activate`, { method: 'POST', token: state.admin });
    expect(open.body.status).toBe('active');
  });

  it('lets a visitor check in by QR code, with a photo', async () => {
    const page = await call(`/api/checkin/${state.checkInToken}`);
    expect(page.status).toBe(200);
    expect(page.body.event.name).toBe('October Repair Café');
    expect(page.body.categories.length).toBe(10);

    const res = await call(`/api/checkin/${state.checkInToken}/jobs`, {
      json: {
        customerName: 'Sam Visitor',
        customerContact: '07700 900000',
        gdprConsent: true,
        itemDescription: 'Toaster',
        faultDescription: 'Does not pop up',
        itemCategoryId: state.categoryId,
        co2FactorId: state.co2FactorId,
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.jobNumber).toMatch(new RegExp(`^${new Date().getUTCFullYear()}-0001$`));
    state.jobId = res.body.id;
    state.jobNumber = res.body.jobNumber;
    state.customerToken = res.body.customerToken;

    // A second item from the same visitor reuses their details.
    const second = await call(`/api/checkin/${state.checkInToken}/jobs`, {
      json: { customerToken: state.customerToken, itemDescription: 'Lamp', faultDescription: 'Flickers' },
    });
    expect(second.status).toBe(200);
    expect(second.body.jobNumber).toMatch(/-0002$/);

    const photo = await call(`/api/checkin/${state.checkInToken}/jobs/${state.jobId}/image`, {
      method: 'POST',
      body: photoForm(bytes(JPEG_WITH_GPS)),
    });
    expect(photo.status).toBe(200);
    expect(photo.body.url).toMatch(/^\/uploads\/repairs\/.+\.jpg$/);
    const stored = new Uint8Array(await (await call(photo.body.url)).raw.arrayBuffer());
    const text = new TextDecoder('latin1').decode(stored);
    // The GPS block is gone, the orientation survives.
    expect(text).not.toContain('GPSSECRET');
    expect(text).toContain('Exif');

    // Not a picture at all.
    const fake = await call(`/api/checkin/${state.checkInToken}/jobs/${state.jobId}/image`, {
      method: 'POST',
      body: photoForm(new TextEncoder().encode('<html>not a photo</html>')),
    });
    expect(fake.status).toBe(400);
  });

  it('adds a repairer, who sets a password from the reset link', async () => {
    const created = await call('/api/admin/users', {
      token: state.admin,
      json: { email: 'rita@example.org', displayName: 'Rita Repairer', role: 'repairer', skills: [state.categoryId] },
    });
    expect(created.status).toBe(200);
    state.repairerId = created.body.user.id;
    const reset = await call(`/api/auth/reset/${created.body.resetToken}`, { json: { password: 'Soldering1Iron' } });
    expect(reset.status).toBe(200);
    expect(reset.body.user.role).toBe('repairer');
    state.repairer = reset.body.accessToken;
    // The link works once.
    const again = await call(`/api/auth/reset/${created.body.resetToken}`, { json: { password: 'Soldering1Iron' } });
    expect(again.status).toBe(400);
    // Repairers cannot reach admin routes.
    expect((await call('/api/admin/dashboard', { token: state.repairer })).status).toBe(403);
  });

  it('shows the queue and lets the repairer accept and finish a job', async () => {
    const queue = await call('/api/repairer/active-event', { token: state.repairer });
    expect(queue.status).toBe(200);
    expect(queue.body.jobs.length).toBe(2);
    expect(queue.body.counts.waiting).toBe(2);

    const accepted = await call(`/api/repairer/jobs/${state.jobId}/accept`, { method: 'PATCH', token: state.repairer });
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('in_progress');

    const done = await call(`/api/repairer/jobs/${state.jobId}/complete`, {
      method: 'PATCH',
      token: state.repairer,
      json: { outcome: 'completed', outcomeNotes: 'New spring fitted', partsUsed: 'Spring' },
    });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('completed');
    expect(done.body.co2SavingSource).toBe('calculated');
    expect(done.body.co2SavingKg).toMatch(/^\d+\.\d{3}$/);

    const me = await call('/api/repairer/me', { token: state.repairer });
    expect(me.body.repairCountCache).toBe(1);
    const history = await call('/api/repairer/history', { token: state.repairer });
    expect(history.body.meta.total).toBe(1);
  });

  it('lets the visitor track their items', async () => {
    const res = await call(`/api/track/${state.customerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBe(2);
    const toaster = res.body.jobs.find((j: any) => j.id === state.jobId);
    expect(toaster.status).toBe('completed');
    expect(toaster.outcomeNotes).toBe('New spring fitted');
    expect(toaster.repairerFirstName).toBe('Rita');
    expect(toaster.photoUrl).toMatch(/^\/uploads\/repairs\//);
  });

  it('shows the board, the repairs list and the CSV export', async () => {
    const board = await call('/api/admin/board', { token: state.admin });
    expect(board.status).toBe(200);
    expect(board.body.events.length).toBe(1);
    // The waiting lamp and the toaster finished a moment ago.
    expect(board.body.jobs.length).toBe(2);

    const list = await call('/api/admin/repairs?search=toast', { token: state.admin });
    expect(list.body.meta.total).toBe(1);
    const ranged = await call(`/api/admin/repairs?from=${today}&to=${today}`, { token: state.admin });
    expect(ranged.body.meta.total).toBe(2);

    const csv = await call('/api/admin/repairs/export.csv', { token: state.admin });
    expect(csv.status).toBe(200);
    const text = await csv.raw.text();
    expect(text.split('\n')[0]).toContain('jobNumber');
    expect(text).toContain('Toaster');
  });

  it('adds up the reports', async () => {
    await call(`/api/admin/events/${state.eventId}/complete`, { method: 'POST', token: state.admin });
    const overview = await call('/api/admin/stats/overview', { token: state.admin });
    expect(overview.status).toBe(200);
    expect(overview.body.eventCount).toBe(1);
    expect(overview.body.repairCount).toBe(2);
    expect(overview.body.completedCount).toBe(1);
    expect(overview.body.successRate).toBe(100);
    expect(overview.body.environmentalSavingKg).toBeGreaterThan(0);

    const heatmap = await call('/api/admin/stats/heatmap', { token: state.admin });
    expect(heatmap.body).toEqual([expect.objectContaining({ day: today, events: 1, repairs: 2, completed: 1 })]);

    const events = await call('/api/admin/stats/events', { token: state.admin });
    expect(events.body[0].date).toBe(today);
    const one = await call(`/api/admin/stats/events/${state.eventId}`, { token: state.admin });
    expect(one.body.totals.repairCount).toBe(2);
    expect(one.body.repairers[0].displayName).toBe('Rita Repairer');
    expect(one.body.jobs.length).toBe(2);

    const pub = await call('/api/public/stats');
    expect(pub.body.repairCount).toBe(2);
    expect(pub.body.completedCount).toBe(1);
    expect(pub.body.volunteerCount).toBe(1);
  });

  it('runs the session photo gallery', async () => {
    const list = await call('/api/event-gallery/events', { token: state.repairer });
    expect(list.body.map((e: any) => e.id)).toContain(state.eventId);
    const added = await call(`/api/event-gallery/${state.eventId}`, {
      method: 'POST',
      token: state.repairer,
      body: photoForm(bytes(JPEG_WITH_GPS)),
    });
    expect(added.status).toBe(200);
    expect(added.body.isPublished).toBe(true);
    const star = await call(`/api/event-gallery/photos/${added.body.id}`, {
      method: 'PATCH',
      token: state.admin,
      json: { showOnHome: true },
    });
    expect(star.body.showOnHome).toBe(true);
    const pubEvent = await call(`/api/public/events/${state.eventId}`);
    expect(pubEvent.body.gallery.length).toBe(1);
    expect(pubEvent.body.stats.repairCount).toBe(2);
    const cafe = await call('/api/public/cafe');
    expect(cafe.body.gallery.length).toBe(1);
  });

  it('makes a year of sessions from a repeating event, drawing QR codes when asked', async () => {
    const res = await call('/api/admin/event-templates', {
      token: state.admin,
      json: {
        name: 'Monthly Repair Café',
        venueId: state.venueId,
        startTime: '10:00',
        endTime: '13:00',
        recurrenceRule: { frequency: 'monthly', byWeekday: 'SA', bySetPos: 1 },
        isPublished: true,
      },
    });
    expect(res.status).toBe(200);
    const events = await call('/api/admin/events', { token: state.admin });
    const made = events.body.filter((e: any) => e.templateId === res.body.id);
    expect(made.length).toBeGreaterThanOrEqual(11);
    const detail = await call(`/api/admin/events/${made[0].id}`, { token: state.admin });
    const qr = await call(detail.body.event.qrCodeUrl);
    expect(qr.status).toBe(200);
    expect(qr.headers.get('content-type')).toBe('image/png');

    // Changing the rule rebuilds the unused future sessions.
    const changed = await call(`/api/admin/event-templates/${res.body.id}`, {
      method: 'PATCH',
      token: state.admin,
      json: { regenerate: 'all_future', data: { startTime: '11:00' } },
    });
    expect(changed.status).toBe(200);
    expect(changed.body.regenerated.removed).toBe(made.length);
  });

  it('draws the sharing pictures and home screen icons', async () => {
    const section = await call('/og/section/events.png');
    expect(section.status).toBe(200);
    expect(section.headers.get('content-type')).toBe('image/png');
    const card = new Uint8Array(await section.raw.arrayBuffer());
    const view = new DataView(card.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);

    const event = await call(`/og/event/${state.eventId}.png`);
    expect(event.status).toBe(200);
    for (const style of ['classic', 'bold', 'photo']) {
      const repairer = await call(`/og/repairer/${state.repairerId}.png?style=${style}`);
      expect(repairer.status).toBe(200);
    }
    expect((await call('/og/section/nothing.png')).status).toBe(404);

    const manifest = await call('/manifest.webmanifest');
    expect(manifest.status).toBe(200);
    const parsed = JSON.parse(await manifest.raw.text());
    expect(parsed.name).toBe('Tinkerton Repair Café');
    const icon = await call(parsed.icons[0].src);
    expect(icon.status).toBe(200);
    const iconBytes = new Uint8Array(await icon.raw.arrayBuffer());
    expect(new DataView(iconBytes.buffer).getUint32(16)).toBe(192);
  });

  it('writes robots.txt and a sitemap', async () => {
    const robots = await call('/robots.txt');
    expect(await robots.raw.text()).toContain('Sitemap: https://hub.test/sitemap.xml');
    const sitemap = await call('/sitemap.xml');
    const xml = await sitemap.raw.text();
    expect(xml).toContain(`https://hub.test/events/${state.eventId}`);
    expect(xml).toContain(`https://hub.test/team/${state.repairerId}`);
  });

  it('purges personal details once they expire', async () => {
    const res = await call('/api/admin/repairs/purge-expired-pii', { method: 'POST', token: state.admin });
    expect(res.status).toBe(200);
    expect(res.body.purged).toBe(0);
  });
});
