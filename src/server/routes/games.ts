import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { GameService } from '../services/game.service.js';
import type { RefreshService } from '../services/refresh.service.js';
import { GameListResponse, GameDetail, AddGameBody, PatchGameBody, BggIdParam } from '../../shared/schemas/index.js';
import { notFound } from '../utils/http-error.js';

export async function gamesRoutes(
  app: FastifyInstance,
  games: GameService,
  refresh: RefreshService,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/games', { schema: { response: { 200: GameListResponse } } }, () => games.listGames());

  r.get(
    '/api/games/:bggId',
    { schema: { params: BggIdParam, response: { 200: GameDetail } } },
    async (req) => {
      const detail = await games.getDetail(req.params.bggId);
      if (!detail) throw notFound('Game not found', 'NOT_FOUND');
      return detail;
    },
  );

  r.post('/api/games', { schema: { body: AddGameBody, response: { 201: GameDetail } } }, async (req, reply) => {
    const detail = await games.addGame(req.body.bggId);
    reply.status(201);
    return detail;
  });

  r.patch(
    '/api/games/:bggId',
    { schema: { params: BggIdParam, body: PatchGameBody, response: { 200: GameDetail } } },
    (req) => games.patchGame(req.params.bggId, req.body),
  );

  r.delete('/api/games/:bggId', { schema: { params: BggIdParam } }, async (req, reply) => {
    await games.deleteGame(req.params.bggId);
    return reply.status(204).send();
  });

  r.post(
    '/api/games/:bggId/refresh',
    { schema: { params: BggIdParam, response: { 200: GameDetail } } },
    async (req) => {
      await refresh.runSingle(req.params.bggId);
      const detail = await games.getDetail(req.params.bggId);
      if (!detail) throw notFound('Game not found', 'NOT_FOUND');
      return detail;
    },
  );
}
