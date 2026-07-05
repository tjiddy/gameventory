import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Cron } from 'croner';
import type { FastifyBaseLogger } from 'fastify';
import { conflict } from '../utils/http-error.js';
import { startRefreshCron } from './refresh.js';
import type { RefreshService } from '../services/refresh.service.js';

let handle: Cron | undefined;

afterEach(() => {
  handle?.stop();
  handle = undefined;
});

/** A logger whose warn/info are spies; everything else is a no-op. */
function spyLogger(): FastifyBaseLogger {
  const noop = (): void => {};
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    level: 'silent',
  } as unknown as FastifyBaseLogger;
  (log as unknown as { child: () => FastifyBaseLogger }).child = () => log;
  return log;
}

describe('startRefreshCron (§8)', () => {
  it('swallows a 409 from startAll — logs the warning and does not reject', async () => {
    const log = spyLogger();
    const refresh = {
      startAll: vi.fn().mockRejectedValue(conflict('A refresh is already running', 'REFRESH_RUNNING')),
    } as unknown as RefreshService;

    // A far-future expression so the scheduler never auto-fires during the test.
    handle = startRefreshCron(refresh, '0 0 1 1 *', log);

    // trigger() runs the scheduled callback manually; it must resolve, not reject.
    await expect(handle.trigger()).resolves.toBeUndefined();

    expect(refresh.startAll).toHaveBeenCalledOnce();
    expect(log.warn).toHaveBeenCalledWith(expect.anything(), 'Scheduled refresh did not start');
  });
});
