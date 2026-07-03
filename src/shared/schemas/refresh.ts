import { z } from 'zod';

export const RefreshFailure = z.object({
  bggId: z.number().int(),
  name: z.string(),
  reason: z.string(),
});
export type RefreshFailure = z.infer<typeof RefreshFailure>;

/** GET /api/refresh/status — in-memory snapshot of the current/last refresh run. */
export const RefreshStatus = z.object({
  state: z.enum(['idle', 'running']),
  current: z.number().int(),
  total: z.number().int(),
  currentGameName: z.string().nullable(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  failures: z.array(RefreshFailure),
});
export type RefreshStatus = z.infer<typeof RefreshStatus>;

/** POST /api/refresh — 202 accepted. */
export const RefreshStartedResponse = z.object({ started: z.boolean() });
