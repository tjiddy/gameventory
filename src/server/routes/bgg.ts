import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { SearchService } from '../services/search.service.js';
import { SearchQuery, BggSearchResponse } from '../../shared/schemas/index.js';

export async function bggRoutes(app: FastifyInstance, search: SearchService): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // 🔒 admin-only (enforced by the default-deny hook — GET /api/bgg/search is the
  // one guarded GET). Reaches BGG, so it must not be an anonymous surface.
  r.get(
    '/api/bgg/search',
    { schema: { querystring: SearchQuery, response: { 200: BggSearchResponse } } },
    (req) => search.search(req.query.q),
  );
}
