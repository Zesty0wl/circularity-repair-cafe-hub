// The hourly jobs, run after ordinary visits rather than by a cron trigger.
import { beforeAll, describe, expect, it } from 'vitest';
import { freshHub } from './helpers.js';
import { maybeRunHousekeeping, resetHousekeepingCheck } from '../src/housekeeping.js';

beforeAll(freshHub);

describe('background jobs', () => {
  it('run once an hour however many requests arrive', async () => {
    resetHousekeepingCheck();
    let runs = 0;
    // A stand-in for the real jobs, which would go out to the internet.
    const jobs = async () => {
      runs++;
    };
    const start = Date.now();
    expect(await maybeRunHousekeeping(start, jobs)).toBe(true);
    // The same Worker instance does not even ask again for ten minutes.
    expect(await maybeRunHousekeeping(start + 60_000, jobs)).toBe(false);
    // Another instance asks, but the hour is not up, so nothing runs.
    resetHousekeepingCheck();
    expect(await maybeRunHousekeeping(start + 30 * 60_000, jobs)).toBe(false);
    // An hour later they run again.
    resetHousekeepingCheck();
    expect(await maybeRunHousekeeping(start + 61 * 60_000, jobs)).toBe(true);
    expect(runs).toBe(2);
  });
});
