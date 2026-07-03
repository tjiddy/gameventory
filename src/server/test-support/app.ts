import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/index.js';
import type { Services } from '../services/di.js';
import type { AuthUser } from '../services/user.service.js';
import { errorHandlerPlugin } from '../plugins/error-handler.js';
import { authPlugin } from '../plugins/auth.js';
import { registerRoutes } from '../routes/index.js';

export interface TestAppOptions {
  /** The admin user for every request, or null (default) for an anonymous client. */
  user?: AuthUser | null;
}

/** Build a ready Fastify app wired with the real error handler, auth hook, and routes. */
export async function buildTestApp(services: Services, db: Db, opts: TestAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin, { resolveUser: () => Promise.resolve(opts.user ?? null) });
  await registerRoutes(app, services, db);
  await app.ready();
  return app;
}
