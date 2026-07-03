import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { unauthorized } from '../utils/http-error.js';
import { config } from '../config.js';

// Phase 1: admin === AUTH_BYPASS (dev only). Phase 3 replaces this default with a
// real Authelia session check; the default-deny policy below does not change.
function defaultIsAdmin(_request: FastifyRequest): boolean {
  return config.authBypass;
}

/**
 * The auth policy (MIGRATION-PLAN §9), as one predicate: every non-GET /api call
 * requires admin; GET /api/bgg/search requires admin; every other GET and all
 * non-/api paths (SPA/static) are public. `path` must already be query-stripped.
 */
export function requiresAdmin(method: string, path: string): boolean {
  if (!path.startsWith('/api/')) return false;
  if (method === 'GET') return path === '/api/bgg/search';
  return true;
}

export interface AuthPluginOptions {
  /** Override the admin check (tests, and the Phase 3 session check). */
  isAdmin?: (request: FastifyRequest) => boolean;
}

/**
 * Global default-deny hook. Because it guards by the (method, path) SHAPE rather
 * than an opt-in list, adding a new mutating route is guarded by construction —
 * forgetting fails closed (§0.4).
 */
export const authPlugin = fp(
  async (app, opts: AuthPluginOptions) => {
    const isAdmin = opts.isAdmin ?? defaultIsAdmin;
    app.addHook('onRequest', async (request) => {
      const path = request.url.split('?')[0] ?? '/';
      if (!requiresAdmin(request.method, path)) return;
      if (!isAdmin(request)) throw unauthorized();
    });
  },
  { name: 'auth' },
);
