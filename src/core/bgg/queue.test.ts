import { describe, it, expect, vi } from 'vitest';
import { BggRequestQueue, type SleepFn } from './queue.js';

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('BggRequestQueue (§0.6 / §7.1 — the single serial gate to BGG)', () => {
  it('serializes: a second task does not start until the first settles', async () => {
    const q = new BggRequestQueue(0); // no spacing, so only ordering is under test
    const first = deferred<string>();
    let secondStarted = false;

    const p1 = q.enqueue(() => first.promise);
    const p2 = q.enqueue(async () => {
      secondStarted = true;
      return 'b';
    });

    // Flush microtasks: the first task is now in flight (pending), and the second
    // must NOT have begun while the first is unresolved.
    await Promise.resolve();
    await Promise.resolve();
    expect(secondStarted).toBe(false);

    first.resolve('a');
    await expect(p1).resolves.toBe('a');
    await expect(p2).resolves.toBe('b');
    expect(secondStarted).toBe(true);
  });

  it('waits ~spacingMs before the SECOND start, never the first', async () => {
    const sleep = vi.fn<SleepFn>(async () => {});
    const q = new BggRequestQueue(2000, sleep);

    await q.enqueue(async () => 'a');
    await q.enqueue(async () => 'b');

    expect(sleep).toHaveBeenCalledTimes(1); // first start is immediate; only the 2nd is spaced
    const waited = sleep.mock.calls[0]![0];
    expect(waited).toBeGreaterThan(0);
    expect(waited).toBeLessThanOrEqual(2000);
  });

  it('a rejected task does not wedge the queue — later tasks still run', async () => {
    const q = new BggRequestQueue(0);

    const bad = q.enqueue(async () => {
      throw new Error('boom');
    });
    await expect(bad).rejects.toThrow('boom');

    // The chain is kept alive across the rejection, so a subsequent task proceeds.
    const good = q.enqueue(async () => 'ok');
    await expect(good).resolves.toBe('ok');
  });
});
