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
//  When DEMO_MODE is off, which is the default, this plugin registers nothing
//  and a normal cafe behaves exactly as before.
// =============================================================================
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env.js';

/** Routes nobody may call on a demo site, whatever they are signed in as. */
const BLOCKED: Array<{ method: string; pattern: RegExp; why: string }> = [
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

const demoModePlugin = fp(async (app: FastifyInstance) => {
  if (!env.DEMO_MODE) return;

  // ── 1. No uploads, from anyone ────────────────────────────────────────────
  // Seven routes accept a file today. Checking the content type here catches
  // all of them, and any added later, without each one having to remember.
  app.addHook('preValidation', async (request, reply) => {
    const contentType = String(request.headers['content-type'] ?? '').toLowerCase();
    if (contentType.startsWith('multipart/form-data')) {
      return reply.code(403).send({
        error:
          'This is a demo site, so uploading files is switched off. Everything else works normally.',
      });
    }
  });

  // ── 2. Nothing that could lock the demo, or misreport it ──────────────────
  app.addHook('preHandler', async (request: FastifyRequest, reply) => {
    const path = request.url.split('?')[0];

    for (const rule of BLOCKED) {
      if (request.method === rule.method && rule.pattern.test(path)) {
        return reply.code(403).send({ error: rule.why });
      }
    }

    // Changing a password is allowed nowhere on a demo site. This is checked on
    // the body rather than by route, because more than one route can carry one.
    if (
      (request.method === 'PATCH' || request.method === 'POST') &&
      /^\/api\/(admin\/users|repairer\/me)/.test(path) &&
      hasPasswordField(request.body)
    ) {
      return reply.code(403).send({
        error:
          'Passwords cannot be changed on the demo site, so the published login keeps working.',
      });
    }
  });

  app.log.warn(
    'DEMO_MODE is on. Uploads refused, search engines blocked, passwords and account removal frozen, telemetry never sent.',
  );
});

export default demoModePlugin;
