import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/index.js';
import type { Services } from '../services/di.js';
import { errorHandlerPlugin } from '../plugins/error-handler.js';
import { authPlugin } from '../plugins/auth.js';
import { registerRoutes } from '../routes/index.js';

export interface TestAppOptions {
  /** Admin check for the auth hook. Defaults to anonymous (default-deny in effect). */
  isAdmin?: (request: FastifyRequest) => boolean;
}

/** Build a ready Fastify app wired with the real error handler, auth hook, and routes. */
export async function buildTestApp(services: Services, db: Db, opts: TestAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin, { isAdmin: opts.isAdmin ?? (() => false) });
  await registerRoutes(app, services, db);
  await app.ready();
  return app;
}
