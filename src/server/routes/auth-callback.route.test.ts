import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { errorHandlerPlugin } from '../plugins/error-handler.js';
import { SESSION_COOKIE } from '../plugins/auth.js';
import { authRoutes, type AuthRoutesDeps } from './auth.js';
import type { OidcService, OidcProfile } from '../services/oidc.service.js';
import { UserService } from '../services/user.service.js';
import { makeTestDb } from '../test-support/db.js';
import type { AppConfig } from '../config.js';

const REDIRECT_URI = 'https://tjiddy.example/api/auth/oidc/authelia/callback';
const ADMIN_SUBJECT = 'admin-sub';

/** A minimal OidcService stand-in: records the callback URL, returns a fixed profile. */
interface FakeOidc {
  recordedUrl: string | null;
  buildAuthUrl: () => Promise<string>;
  handleCallback: (url: string) => Promise<OidcProfile>;
}
function makeFakeOidc(profile: OidcProfile): FakeOidc {
  const fake: FakeOidc = {
    recordedUrl: null,
    buildAuthUrl: () => Promise.resolve('https://authelia.example/authorize'),
    handleCallback: (url) => {
      fake.recordedUrl = url;
      return Promise.resolve(profile);
    },
  };
  return fake;
}

/**
 * A purpose-built harness that mirrors the production Fastify setup `authRoutes`
 * depends on (Zod compilers for the /api/auth/me response schema, @fastify/cookie
 * for set/clearCookie, the standard error handler) but omits the global auth hook —
 * so the unit can drive the admin-guarded logout route unauthenticated.
 */
async function buildHarness(
  fake: FakeOidc,
  over: Partial<Pick<AuthRoutesDeps, 'sessionSecret' | 'bootstrapAdmin'>> = {},
): Promise<{ app: FastifyInstance; users: UserService }> {
  const db = await makeTestDb();
  const users = new UserService(db);
  const config = { isProd: false, oidc: { redirectUri: REDIRECT_URI } } as unknown as AppConfig;
  const deps: AuthRoutesDeps = {
    oidc: fake as unknown as OidcService,
    users,
    config,
    sessionSecret: 'sess-secret',
    bootstrapAdmin: `authelia:${ADMIN_SUBJECT}`,
    ...over,
  };

  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(cookie);
  await app.register(errorHandlerPlugin);
  await authRoutes(app, deps);
  await app.ready();
  return { app, users };
}

const profile = (over: Partial<OidcProfile> = {}): OidcProfile => ({
  subject: ADMIN_SUBJECT,
  displayName: 'Admin',
  email: 'admin@example.com',
  ...over,
});

describe('authRoutes OIDC callback', () => {
  it('redirects a non-admin subject to /login?error=oidc and mints no session cookie', async () => {
    const fake = makeFakeOidc(profile({ subject: 'not-the-admin' }));
    const { app } = await buildHarness(fake);

    const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/authelia/callback?state=x&code=y' });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/login?error=oidc');
    expect(res.headers['set-cookie']).toBeUndefined();
    await app.close();
  });

  it('upserts the admin, sets a gv_session cookie, and redirects to /', async () => {
    const fake = makeFakeOidc(profile());
    const { app, users } = await buildHarness(fake);

    const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/authelia/callback?state=x&code=y' });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    // ensureUser ran for the admin subject.
    expect(await users.getBySubject('authelia', ADMIN_SUBJECT)).toBeDefined();
    await app.close();
  });

  it('does not set a cookie when no sessionSecret is configured', async () => {
    const fake = makeFakeOidc(profile());
    const { app } = await buildHarness(fake, { sessionSecret: undefined });

    const res = await app.inject({ method: 'GET', url: '/api/auth/oidc/authelia/callback?state=x&code=y' });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(res.headers['set-cookie']).toBeUndefined();
    await app.close();
  });

  it('reconstructs the callback URL from the configured redirectUri, not the attacker Host header', async () => {
    const fake = makeFakeOidc(profile());
    const { app } = await buildHarness(fake);

    await app.inject({
      method: 'GET',
      url: '/api/auth/oidc/authelia/callback?state=x&code=y',
      headers: { host: 'evil.example' },
    });

    expect(fake.recordedUrl).not.toBeNull();
    expect(fake.recordedUrl!.startsWith('https://tjiddy.example/')).toBe(true);
    expect(fake.recordedUrl).not.toContain('evil.example');
    // The incoming query is preserved on the trusted origin.
    expect(fake.recordedUrl).toContain('state=x&code=y');
    await app.close();
  });
});

describe('authRoutes logout', () => {
  it('clears gv_session and returns 204', async () => {
    const fake = makeFakeOidc(profile());
    const { app } = await buildHarness(fake);

    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });

    expect(res.statusCode).toBe(204);
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    // A clearing cookie has an expiry in the past / Max-Age=0.
    expect(setCookie.toLowerCase()).toMatch(/expires|max-age/);
    await app.close();
  });
});
