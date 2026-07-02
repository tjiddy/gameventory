import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db/index.js';
import { healthRoutes } from './health.js';

// Route registry — adding a route means one entry here. Phase 1 grows this into a
// services-injected registry (createServices + DI container); Phase 0 needs only db.
export async function registerRoutes(app: FastifyInstance, db: Db): Promise<void> {
  await healthRoutes(app, db);
}
