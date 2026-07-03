import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AuthMeResponse } from '../../shared/schemas/index.js';
import type { OidcService } from '../services/oidc.service.js';
import type { UserService } from '../services/user.service.js';
import type { AppConfig } from '../config.js';
import { setSessionCookie, clearSessionCookie } from '../plugins/auth.js';
import { forbidden } from '../utils/http-error.js';
import { serializeError } from '../utils/serialize-error.js';

/** Throw 403 unless `subject` is the single configured `authelia:<subject>` admin (§9). */
export function assertBootstrapAdmin(bootstrap: string | undefined, subject: string): void {
  const idx = bootstrap ? bootstrap.indexOf(':') : -1;
  const provider = bootstrap && idx > 0 ? bootstrap.slice(0, idx) : '';
  const adminSubject = bootstrap && idx > 0 ? bootstrap.slice(idx + 1) : '';
  if (provider !== 'authelia' || !adminSubject || subject !== adminSubject) {
    throw forbidden('Not an authorized admin', 'NOT_ADMIN');
  }
}

export interface AuthRoutesDeps {
  oidc: OidcService | null;
  users: UserService;
  config: AppConfig;
  sessionSecret: string | undefined;
  bootstrapAdmin: string | undefined;
}

export async function authRoutes(app: FastifyInstance, deps: AuthRoutesDeps): Promise<void> {
  const a = app.withTypeProvider<ZodTypeProvider>();

  a.get('/api/auth/me', { schema: { response: { 200: AuthMeResponse } } }, (request) => ({
    user: request.user ? { displayName: request.user.displayName } : null,
  }));

  const oidc = deps.oidc;
  if (!oidc) return; // OIDC endpoints exist only when Authelia is configured (Phase 3 runtime)

  a.get('/api/auth/oidc/authelia/login', async (_request, reply) => {
    return reply.redirect(await oidc.buildAuthUrl());
  });

  a.get('/api/auth/oidc/authelia/callback', async (request, reply) => {
    try {
      // Reconstruct the callback URL from the CONFIGURED redirect URI + the incoming
      // query only — never the attacker-controllable Host header.
      const redirectUri = deps.config.oidc?.redirectUri ?? '';
      const callbackUrl = new URL(redirectUri);
      callbackUrl.search = new URL(request.url, callbackUrl.origin).search;
      const profile = await oidc.handleCallback(callbackUrl.toString());
      assertBootstrapAdmin(deps.bootstrapAdmin, profile.subject);
      const row = await deps.users.ensureUser('authelia', profile.subject, profile.displayName, profile.email, new Date());
      if (deps.sessionSecret) setSessionCookie(reply, deps.config, deps.sessionSecret, row);
      return await reply.redirect('/');
    } catch (err: unknown) {
      request.log.warn({ error: serializeError(err) }, 'OIDC callback failed');
      return reply.redirect('/login?error=oidc');
    }
  });

  a.post('/api/auth/logout', async (_request, reply) => {
    clearSessionCookie(reply, deps.config);
    return reply.status(204).send();
  });
}
