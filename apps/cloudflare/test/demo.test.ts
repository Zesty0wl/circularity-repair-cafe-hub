// DEMO_MODE, on a public try-it-out site. The rules are in plugins/demoMode.ts.
import { env, withEnv } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { BASE, call, freshHub, photoForm, setUpHub } from './helpers.js';
import { handleApi } from '../src/app.js';
import { bytes, TINY_JPEG } from './fixtures.js';

beforeAll(freshHub);

/** Call the API with DEMO_MODE switched on, in this request only. */
function demoCall(path: string, init: RequestInit = {}): Promise<Response> {
  return withEnv({ ...(env as object), DEMO_MODE: 'true' }, () =>
    handleApi(new Request(`${BASE}${path}`, init)),
  ) as Promise<Response>;
}

describe('demo mode', () => {
  it('refuses uploads, password changes and imports, and keeps search engines out', async () => {
    const { token } = await setUpHub();
    const auth = { Authorization: `Bearer ${token}` };
    const upload = await demoCall('/api/repairer/me/avatar', { method: 'POST', headers: auth, body: photoForm(bytes(TINY_JPEG)) });
    expect(upload.status).toBe(403);
    const password = await demoCall('/api/repairer/me', {
      method: 'PATCH',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'NewPassword1' }),
    });
    expect(password.status).toBe(403);
    const restore = await demoCall('/api/admin/backup/import/begin', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(restore.status).toBe(403);
    expect(await (await demoCall('/robots.txt')).text()).toContain('Disallow: /');
    expect(((await (await demoCall('/api/public/cafe')).json()) as { demoMode: boolean }).demoMode).toBe(true);
    // And nothing changes once it is off again.
    const cafe = await call('/api/public/cafe');
    expect(cafe.body.demoMode).toBe(false);
  });
});
