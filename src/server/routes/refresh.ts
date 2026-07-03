import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { RefreshService } from '../services/refresh.service.js';
import { RefreshStatus, RefreshStartedResponse } from '../../shared/schemas/index.js';

export async function refreshRoutes(app: FastifyInstance, refresh: RefreshService): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post('/api/refresh', { schema: { response: { 202: RefreshStartedResponse } } }, async (_req, reply) => {
    await refresh.startAll();
    reply.status(202);
    return { started: true };
  });

  r.get('/api/refresh/status', { schema: { response: { 200: RefreshStatus } } }, () => refresh.getStatus());
}
