import { describe, it, expect, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { setSessionCookie, clearSessionCookie, makeResolveUser, SESSION_COOKIE } from './auth.js';
import type { AppConfig } from '../config.js';
import type { UserService } from '../services/user.service.js';

const cfg = (over: Partial<AppConfig>): AppConfig =>
  ({ isProd: false, authBypass: false, ...over } as unknown as AppConfig);

describe('session cookie hardening', () => {
  it('setSessionCookie sets HttpOnly + SameSite=Lax + Secure (in prod) + a positive Max-Age', () => {
    const setCookie = vi.fn();
    const reply = { setCookie } as unknown as FastifyReply;

    setSessionCookie(reply, cfg({ isProd: true }), 'a-secret', { id: 7, subject: 's' });

    const [name, , opts] = setCookie.mock.calls[0]!;
    expect(name).toBe(SESSION_COOKIE);
    expect(opts).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax', secure: true });
    expect(opts.maxAge).toBeGreaterThan(0);
  });

  it('omits Secure when not in prod (so dev-over-http sessions still work)', () => {
    const setCookie = vi.fn();
    setSessionCookie({ setCookie } as unknown as FastifyReply, cfg({ isProd: false }), 'a-secret', { id: 7, subject: 's' });
    expect(setCookie.mock.calls[0]![2].secure).toBe(false);
  });

  it('clearSessionCookie clears the session cookie', () => {
    const clearCookie = vi.fn();
    clearSessionCookie({ clearCookie } as unknown as FastifyReply, cfg({ isProd: true }));
    expect(clearCookie).toHaveBeenCalledWith(SESSION_COOKIE, expect.objectContaining({ path: '/', secure: true }));
  });
});

describe('makeResolveUser', () => {
  it('returns the dev admin under AUTH_BYPASS without touching the DB', async () => {
    const resolve = makeResolveUser({ config: cfg({ authBypass: true }), users: {} as UserService, sessionSecret: undefined });
    const user = await resolve({ cookies: {} } as unknown as FastifyRequest);
    expect(user).toMatchObject({ subject: 'dev-admin' });
  });

  it('returns null when no session cookie is present', async () => {
    const resolve = makeResolveUser({ config: cfg({ authBypass: false }), users: {} as UserService, sessionSecret: 'secret' });
    const user = await resolve({ cookies: {} } as unknown as FastifyRequest);
    expect(user).toBeNull();
  });
});
