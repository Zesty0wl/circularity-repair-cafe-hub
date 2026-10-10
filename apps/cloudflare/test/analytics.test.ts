// Choosing an analytics service: Plausible or Quick Web Analytics (QWA), and
// which QWA events to count. See packages/shared/src/analytics.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_QWA_EVENTS,
  activeAnalytics,
  cleanQwaEvents,
  cleanSiteDomain,
  redactAnalyticsPath,
} from '../../../packages/shared/src/analytics.js';
import { call, freshHub, setUpHub } from './helpers.js';

describe('which analytics service runs', () => {
  it('keeps an older hub on Plausible when both fields are filled in', () => {
    expect(activeAnalytics({ plausibleDomain: 'a.org', plausibleSrc: 'https://p.io/js/script.js' })).toBe('plausible');
    expect(activeAnalytics({ plausibleDomain: 'a.org' })).toBe('none');
    expect(activeAnalytics(null)).toBe('none');
  });

  it('runs only the chosen service, and only once it is filled in', () => {
    const both = {
      plausibleDomain: 'a.org',
      plausibleSrc: 'https://p.io/js/script.js',
      qwaSite: 'a.org',
      qwaSrc: 'https://q.io/t.js',
    };
    expect(activeAnalytics({ ...both, analyticsProvider: 'qwa' })).toBe('qwa');
    expect(activeAnalytics({ ...both, analyticsProvider: 'plausible' })).toBe('plausible');
    expect(activeAnalytics({ ...both, analyticsProvider: 'none' })).toBe('none');
    expect(activeAnalytics({ ...both, qwaSrc: null, analyticsProvider: 'qwa' })).toBe('none');
  });

  it('tidies what an admin types', () => {
    expect(cleanSiteDomain(' https://RepairCafe.Example.org/events?x=1 ')).toBe('repaircafe.example.org');
    expect(cleanSiteDomain('')).toBeNull();
    expect(cleanQwaEvents(['donate', 'nonsense', 'donate', 3])).toEqual(['donate']);
    expect(cleanQwaEvents(null)).toBeNull();
  });

  it('hides the secret part of private links', () => {
    expect(redactAnalyticsPath('/track/abc123')).toBe('/track/_');
    expect(redactAnalyticsPath('/checkin/abc123')).toBe('/checkin/_');
    expect(redactAnalyticsPath('/display/abc123')).toBe('/display/_');
    expect(redactAnalyticsPath('/reset/abc123')).toBe('/reset/_');
    expect(redactAnalyticsPath('/events/abc123')).toBe('/events/abc123');
  });
});

describe('the analytics settings', () => {
  let admin = '';
  beforeAll(async () => {
    await freshHub();
    admin = (await setUpHub()).token;
  });

  const save = (json: Record<string, unknown>) =>
    call('/api/admin/settings/seo', { method: 'PATCH', token: admin, json });
  const publicCafe = async () => (await call('/api/public/cafe')).body;

  it('loads nothing until a service is set up', async () => {
    const cafe = await publicCafe();
    expect(cafe.analyticsProvider).toBe('none');
    expect(cafe.qwaSite).toBeNull();
  });

  it('turns QWA on with every event, and sends only its fields', async () => {
    const res = await save({
      analyticsProvider: 'qwa',
      plausibleDomain: 'old.example.org',
      plausibleSrc: 'https://plausible.example.org/js/script.js',
      qwaSite: 'https://repaircafe.example.org/',
      qwaSrc: 'https://analytics.example.org/t.js',
    });
    expect(res.status).toBe(200);
    expect(res.body.qwaSite).toBe('repaircafe.example.org');
    const cafe = await publicCafe();
    expect(cafe.analyticsProvider).toBe('qwa');
    expect(cafe.qwaSrc).toBe('https://analytics.example.org/t.js');
    expect(cafe.qwaEvents).toEqual(DEFAULT_QWA_EVENTS);
    expect(cafe.plausibleSrc).toBeNull();
  });

  it('remembers which events are turned off', async () => {
    expect((await save({ qwaEvents: ['checkin', 'donate'] })).status).toBe(200);
    expect((await publicCafe()).qwaEvents).toEqual(['checkin', 'donate']);
  });

  it('switches back to Plausible without losing its settings', async () => {
    expect((await save({ analyticsProvider: 'plausible' })).status).toBe(200);
    const cafe = await publicCafe();
    expect(cafe.analyticsProvider).toBe('plausible');
    expect(cafe.plausibleDomain).toBe('old.example.org');
    expect(cafe.qwaSite).toBeNull();
    expect(cafe.qwaEvents).toEqual([]);
  });

  it('refuses an unknown service or a script that is not https', async () => {
    expect((await save({ analyticsProvider: 'google' })).status).toBe(400);
    expect((await save({ qwaSrc: 'http://analytics.example.org/t.js' })).status).toBe(400);
    expect((await save({ qwaSrc: 'javascript:alert(1)' })).status).toBe(400);
  });

  it('is for admins only', async () => {
    expect((await call('/api/admin/settings/seo', { method: 'PATCH', json: { analyticsProvider: 'none' } })).status).toBe(401);
  });
});
