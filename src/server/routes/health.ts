import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../../db/index.js';
import { config } from '../config.js';

const HealthResponse = z.object({
  status: z.literal('ok'),
  version: z.string(),
});

/**
 * GET /api/health — container liveness/readiness probe. Runs a trivial query so a
 * broken DB (or unloadable @libsql native binding) surfaces as a non-200.
 */
export async function healthRoutes(app: FastifyInstance, db: Db): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/health',
    { schema: { response: { 200: HealthResponse } } },
    async () => {
      await db.run(sql`SELECT 1`);
      return { status: 'ok' as const, version: config.version };
    },
  );
}
