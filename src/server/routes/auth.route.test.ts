import { describe, it, expect } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { makeTestDb } from '../test-support/db.js';
import { assertBootstrapAdmin } from './auth.js';
import { UserService } from '../services/user.service.js';
import { makeResolveUser, SESSION_COOKIE } from '../plugins/auth.js';
import { createSessionToken } from '../utils/session.js';
import { config } from '../config.js';

describe('assertBootstrapAdmin (§9 single-admin gate)', () => {
  it('accepts the configured admin subject', () => {
    expect(() => assertBootstrapAdmin('authelia:abc-123', 'abc-123')).not.toThrow();
  });

  it('rejects any other subject with a 403', () => {
    let status: number | undefined;
    try {
      assertBootstrapAdmin('authelia:abc-123', 'someone-else');
    } catch (e) {
      status = (e as { statusCode: number }).statusCode;
    }
    expect(status).toBe(403);
  });

  it('rejects when bootstrap is unset, has no provider, or names another provider', () => {
    expect(() => assertBootstrapAdmin(undefined, 'abc')).toThrow();
    expect(() => assertBootstrapAdmin('abc-no-colon', 'abc-no-colon')).toThrow();
    expect(() => assertBootstrapAdmin('google:abc', 'abc')).toThrow();
    expect(() => assertBootstrapAdmin('authelia:', '')).toThrow();
  });
});

describe('UserService single-admin upsert', () => {
  it('upserts one row per (provider, subject) and refreshes the display name', async () => {
    const db = await makeTestDb();
    const users = new UserService(db);
    const now = new Date();
    const first = await users.ensureUser('authelia', 'sub-1', 'Todd', 't@x.com', now);
    const again = await users.ensureUser('authelia', 'sub-1', 'Todd Renamed', 't@x.com', now);
    expect(again.id).toBe(first.id);
    expect(again.displayName).toBe('Todd Renamed');
    expect(users.toAuthUser(again)).toEqual({ id: first.id, subject: 'sub-1', displayName: 'Todd Renamed' });
  });
});

describe('makeResolveUser session resolution', () => {
  it('returns the user for a valid cookie, null for a bad/absent one', async () => {
    const db = await makeTestDb();
    const users = new UserService(db);
    const row = await users.ensureUser('authelia', 'sub-9', 'Admin', null, new Date());
    const secret = 'sess-secret';
    const resolve = makeResolveUser({ config, users, sessionSecret: secret });
    const asReq = (cookies: Record<string, string>): FastifyRequest => ({ cookies }) as unknown as FastifyRequest;

    const valid = createSessionToken({ uid: row.id, sub: row.subject }, secret);
    expect(await resolve(asReq({ [SESSION_COOKIE]: valid }))).toMatchObject({ id: row.id, displayName: 'Admin' });
    expect(await resolve(asReq({ [SESSION_COOKIE]: 'tampered.token' }))).toBeNull();
    expect(await resolve(asReq({}))).toBeNull();
  });

  it('returns null when the token is valid but the user row is gone (deleted user)', async () => {
    const db = await makeTestDb();
    const users = new UserService(db);
    const secret = 'sess-secret';
    const resolve = makeResolveUser({ config, users, sessionSecret: secret });
    const asReq = (cookies: Record<string, string>): FastifyRequest => ({ cookies }) as unknown as FastifyRequest;

    // Mint a valid token for an id with no backing row (getById → undefined).
    const orphan = createSessionToken({ uid: 999_999, sub: 'ghost' }, secret);
    expect(await resolve(asReq({ [SESSION_COOKIE]: orphan }))).toBeNull();
  });
});
