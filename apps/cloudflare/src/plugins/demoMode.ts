// =============================================================================
//  Demo mode
//  ---------------------------------------------------------------------------
//  Everything that changes when DEMO_MODE is on lives in this one file, so the
//  whole policy can be read in a minute and audited in one place.
//
//  This is a switch for the whole instance, not a kind of user account. That
//  matters: the check-in flow has no login at all, because visitors reach it by
//  scanning a QR code on a poster. So the riskiest thing about a public demo,
//  somebody putting a picture on your domain that you would not want there,
//  cannot be prevented by limiting what a signed-in account may do. It has to
//  be refused for everyone, signed in or not.
//
//  When DEMO_MODE is off, which is the default, the hook below returns at once
//  and a normal cafe behaves exactly as before.
// =============================================================================
import type { HubReply, HubRequest } from '../lib/router.js';
import { bindings, env } from '../env.js';
import { hashToken } from '../utils/tokens.js';

const DEMO_KEY_HEADER = 'x-demo-key';

/**
 * Does this request carry the demo's reset key? Only demo/seed.py has it. It
 * may upload the demo's photographs and set its passwords, which nobody else
 * may do, and it may wipe the demo (routes/demo.ts). Both values are hashed
 * before they are compared, so the comparison takes the same time whether or
 * not the guess is close.
 */
export async function hasDemoKey(request: HubRequest): Promise<boolean> {
  const expected = bindings().DEMO_RESET_KEY;
  const given = request.headers[DEMO_KEY_HEADER];
  if (!expected || expected.length < 16 || typeof given !== 'string' || !given) return false;
  return (await hashToken(given)) === (await hashToken(expected));
}

/** Routes nobody may call on a demo site, whatever they are signed in as. */
const BLOCKED: Array<{ method: string; pattern: RegExp; why: string }> = [
  // Importing a backup replaces everything, including the published login.
  {
    method: 'POST',
    pattern: /^\/api\/(admin\/backup|setup|backup)\/import(\/.*)?$/,
    why: 'Importing a backup is switched off on the demo site.',
  },
  // Keep the published login working. If someone could delete the demo account
  // or change its password, the next visitor would find a site they cannot get
  // into, and it would stay that way until the next reset.
  {
    method: 'DELETE',
    pattern: /^\/api\/admin\/users\/[^/]+$/,
    why: 'Accounts cannot be removed on the demo site, so the published login keeps working.',
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/users\/[^/]+\/reset-link$/,
    why: 'Password resets are switched off on the demo site.',
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/reset\/[^/]+$/,
    why: 'Password resets are switched off on the demo site.',
  },
  // A demo cafe is not a real one, and must never be counted as one in the
  // figures we publish, nor appear on the worldwide map as somebody's café.
  {
    method: 'PATCH',
    pattern: /^\/api\/admin\/telemetry$/,
    why: 'The demo site never sends figures to the project.',
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/telemetry\/send$/,
    why: 'The demo site never sends figures to the project.',
  },
];

function hasPasswordField(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    'password' in (body as Record<string, unknown>) &&
    Boolean((body as Record<string, unknown>).password)
  );
}

/**
 * Runs before every API route. A Worker's settings are read per request, so
 * this is always there and checks the setting first.
 */
export async function demoModeHook(request: HubRequest, reply: HubReply): Promise<void> {
  if (!env.DEMO_MODE) return;
  // The seeder builds the demo through the same API, photographs included.
  if (await hasDemoKey(request)) return;

  // ── 1. No uploads, from anyone ────────────────────────────────────────────
  // Seven routes accept a file today. Checking the content type here catches
  // all of them, and any added later, without each one having to remember.
  const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
  if (contentType.startsWith('multipart/form-data') || contentType.startsWith('application/zip')) {
    reply.code(403).send({
      error: 'This is a demo site, so uploading files is switched off. Everything else works normally.',
    });
    return;
  }

  // ── 2. Nothing that could lock the demo, or misreport it ──────────────────
  const path = request.url.split('?')[0]!;
  for (const rule of BLOCKED) {
    if (request.method === rule.method && rule.pattern.test(path)) {
      reply.code(403).send({ error: rule.why });
      return;
    }
  }

  // Changing a password is allowed nowhere on a demo site. This is checked on
  // the body rather than by route, because more than one route can carry one.
  if (
    (request.method === 'PATCH' || request.method === 'POST') &&
    /^\/api\/(admin\/users|repairer\/me)/.test(path) &&
    hasPasswordField(request.body)
  ) {
    reply.code(403).send({
      error: 'Passwords cannot be changed on the demo site, so the published login keeps working.',
    });
  }
}
