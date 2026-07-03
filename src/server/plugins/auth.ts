import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CookieSerializeOptions } from '@fastify/cookie';
import { unauthorized } from '../utils/http-error.js';
import { createSessionToken, verifySessionToken, SESSION_TTL_MS } from '../utils/session.js';
import type { AppConfig } from '../config.js';
import type { AuthUser, UserService } from '../services/user.service.js';
import './../types.js';

export const SESSION_COOKIE = 'gv_session';

/**
 * The auth policy (MIGRATION-PLAN §9): every non-GET /api call requires admin; GET
 * /api/bgg/search requires admin; every other GET and all non-/api paths are public.
 * `path` must already be query-stripped.
 */
export function requiresAdmin(method: string, path: string): boolean {
  if (!path.startsWith('/api/')) return false;
  // Every /api/admin/* route (GET and non-GET) is admin-only. This branch MUST
  // precede the GET branch below, or admin GET routes would fall through to public.
  if (path.startsWith('/api/admin/')) return true;
  if (method === 'GET') return path === '/api/bgg/search';
  return true;
}

export interface AuthPluginOptions {
  /** Resolve the request's admin user (session cookie, or the bypass dev admin). */
  resolveUser: (request: FastifyRequest) => Promise<AuthUser | null>;
}

/**
 * Global default-deny hook. It attaches request.user, then guards by (method, path)
 * SHAPE — so a new mutating route is guarded by construction; forgetting fails closed.
 */
export const authPlugin = fp(
  async (app, opts: AuthPluginOptions) => {
    app.decorateRequest('user', null);
    app.addHook('onRequest', async (request) => {
      request.user = await opts.resolveUser(request);
      const path = request.url.split('?')[0] ?? '/';
      if (requiresAdmin(request.method, path) && !request.user) throw unauthorized();
    });
  },
  { name: 'auth' },
);

export interface ResolveUserDeps {
  config: AppConfig;
  users: UserService;
  sessionSecret: string | undefined;
}

const DEV_ADMIN: AuthUser = { id: 0, subject: 'dev-admin', displayName: 'Dev Admin' };

/** Production resolver: AUTH_BYPASS → dev admin; otherwise the session-cookie user. */
export function makeResolveUser(deps: ResolveUserDeps): (request: FastifyRequest) => Promise<AuthUser | null> {
  return async (request) => {
    if (deps.config.authBypass) return DEV_ADMIN;
    const cookie = request.cookies?.[SESSION_COOKIE];
    if (!cookie || !deps.sessionSecret) return null;
    const payload = verifySessionToken(cookie, deps.sessionSecret);
    if (!payload) return null;
    const row = await deps.users.getById(payload.uid);
    return row ? deps.users.toAuthUser(row) : null;
  };
}

function sessionCookieOptions(config: AppConfig): CookieSerializeOptions {
  return { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}

export function setSessionCookie(reply: FastifyReply, config: AppConfig, sessionSecret: string, user: { id: number; subject: string }): void {
  const token = createSessionToken({ uid: user.id, sub: user.subject }, sessionSecret);
  reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(config));
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', ...(config.isProd ? { secure: true } : {}) });
}
