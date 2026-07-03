import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/index.js';
import type { Services } from '../services/di.js';
import { healthRoutes } from './health.js';
import { gamesRoutes } from './games.js';
import { refreshRoutes } from './refresh.js';
import { bggRoutes } from './bgg.js';
import { authRoutes } from './auth.js';

/** Route registry — adding a route means one line here. */
export async function registerRoutes(app: FastifyInstance, services: Services, db: Db): Promise<void> {
  await healthRoutes(app, db);
  await gamesRoutes(app, services.games, services.refresh);
  await refreshRoutes(app, services.refresh);
  await bggRoutes(app, services.search);
  await authRoutes(app);
}
