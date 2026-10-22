// The claim secret that ties this hub to its install id at the telemetry
// collector. See telemetryClaim() in src/services/telemetry.ts.
import { env, withEnv } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { call, freshHub, setUpHub } from './helpers.js';
import { sendTelemetry, type SendResult } from '../src/services/telemetry.js';
import { sha256Hex } from '../src/lib/crypto.js';

beforeAll(freshHub);
afterEach(() => vi.restoreAllMocks());

const db = () => (env as unknown as { DB: D1Database }).DB;

/** Send now, with telemetry switched on, as the hourly job would. */
function send(): Promise<SendResult> {
  return withEnv({ ...(env as object), TELEMETRY_DISABLED: 'false' }, () => sendTelemetry({ force: true })) as Promise<SendResult>;
}

/** A pretend collector. Answers in turn, and remembers what it was sent. */
function collector(...answers: Response[]) {
  const sent: Array<{ auth: string | null; body: any }> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const headers = new Headers(init?.headers);
    sent.push({ auth: headers.get('Authorization'), body: JSON.parse(String(init?.body ?? '{}')) });
    return answers.shift() ?? Response.json({ ok: true });
  });
  return sent;
}

describe('the claim secret', () => {
  it('is sent with each ping, and only its hash is published', async () => {
    await setUpHub();
    await db().prepare("UPDATE cafes SET telemetry_level = 'community'").run();
    const sent = collector(Response.json({ ok: true, token: 'first-token' }));
    const result = await send();
    expect(result.ok).toBe(true);

    const claim = sent[0]!.body.claim as string;
    expect(claim).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    const published = (await call('/api/public/telemetry')).body;
    expect(published.claimHash).toBe(await sha256Hex(claim));
    expect(JSON.stringify(published)).not.toContain(claim);
  });

  it('asks again without its token when the collector refuses it, and keeps the new token', async () => {
    const sent = collector(
      Response.json({ error: 'That token does not match' }, { status: 401 }),
      Response.json({ ok: true, token: 'taken-back' }),
    );
    const result = await send();
    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.auth).toBe('Bearer first-token');
    expect(sent[1]!.auth).toBeNull();
    expect(sent[1]!.body.claim).toBe(sent[0]!.body.claim);
    const row = await db().prepare('SELECT telemetry_token FROM cafes').first<{ telemetry_token: string }>();
    expect(row?.telemetry_token).toBe('taken-back');
  });
});
