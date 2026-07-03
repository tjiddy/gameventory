import fs from 'fs';
import path from 'path';

// Load .env from repo root if present. Production (Docker) doesn't ship one —
// env comes from compose/Portainer — so silently skip when missing.
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env file (expected in production) */
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { createDb, runMigrations } from '../db/index.js';
import { config } from './config.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { authPlugin } from './plugins/auth.js';
import { createServices } from './services/di.js';
import { startRefreshCron } from './jobs/refresh.js';
import { registerRoutes } from './routes/index.js';
import { registerStaticAndSpa, listenWithRetry } from './server-utils.js';

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception — process will exit:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection — process will exit:', reason);
  process.exit(1);
});

async function main() {
  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: config.trustedProxies,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // CORS — dev serves the SPA from Vite (:5173) on a different origin; prod serves
  // it same-origin so no cross-origin access is granted.
  await app.register(cors, {
    origin: config.isDev ? ['http://localhost:5173'] : false,
    credentials: true,
  });

  // Baseline security headers. CSP is disabled here (the Vite-built SPA needs its
  // own policy); a tailored CSP is a later hardening pass.
  await app.register(helmet, { contentSecurityPolicy: false });

  // Rate limiting is opt-in per route (global: false).
  await app.register(rateLimit, { global: false });

  await app.register(cookie);

  // Ensure the DB directory exists before opening/migrating.
  const dbDir = path.dirname(config.dbPath);
  if (dbDir && !fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  app.log.info({ dbPath: config.dbPath }, 'Running migrations');
  await runMigrations(config.dbPath);
  const db = createDb(config.dbPath);
  const services = createServices(db, app.log);

  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);
  await registerRoutes(app, services, db);

  // Serve the built SPA whenever a build exists (self-guards on dist/client).
  // Dev uses the Vite dev server, so there's usually no build to serve there.
  await registerStaticAndSpa(app);

  // Weekly metadata refresh (also samples stat-history). Manual trigger is POST /api/refresh.
  const refreshCron = startRefreshCron(services.refresh, config.refreshCron, app.log);

  const shutdown = async () => {
    refreshCron.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await listenWithRetry(app, config.port, config.bindHost);
  app.log.info({ port: config.port, host: config.bindHost }, 'Server running');
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
