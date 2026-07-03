import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AuthMeResponse } from '../../shared/schemas/index.js';
import { config } from '../config.js';

/**
 * Phase 1 stub. AUTH_BYPASS surfaces a dev admin so the frontend's useAuth works;
 * the real Authelia OIDC login/callback/logout endpoints land in Phase 3.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/auth/me', { schema: { response: { 200: AuthMeResponse } } }, () => ({
    user: config.authBypass ? { displayName: 'Dev Admin' } : null,
  }));
}
