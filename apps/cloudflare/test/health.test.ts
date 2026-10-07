import { worker, freshHub } from './helpers.js';
import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(freshHub);

describe('health', () => {
  it('answers and creates the database', async () => {
    const res = await worker.fetch('https://hub.test/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('gives a JSON 404 for an unknown API path', async () => {
    const res = await worker.fetch('https://hub.test/api/nothing-here');
    expect(res.status).toBe(404);
  });
});
