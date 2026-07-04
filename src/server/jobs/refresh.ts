import { Cron } from 'croner';
import type { FastifyBaseLogger } from 'fastify';
import type { RefreshService } from '../services/refresh.service.js';
import { serializeError } from '../utils/serialize-error.js';

/**
 * Schedule the weekly refresh (§8). Fire-and-forget: startAll kicks
 * the background run and returns; a 409 (a run already in flight) is logged, not
 * fatal. Returns the Cron handle so shutdown can stop it.
 */
export function startRefreshCron(
  refresh: RefreshService,
  cronExpr: string,
  log: FastifyBaseLogger,
): Cron {
  return new Cron(cronExpr, async () => {
    try {
      log.info({ cron: cronExpr }, 'Starting scheduled refresh');
      await refresh.startAll();
    } catch (e: unknown) {
      log.warn({ error: serializeError(e) }, 'Scheduled refresh did not start');
    }
  });
}
