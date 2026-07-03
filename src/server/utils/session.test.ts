import { describe, it, expect } from 'vitest';
import { createSessionToken, verifySessionToken, SESSION_TTL_MS } from './session.js';

const SECRET = 'test-secret';

describe('session token', () => {
  it('round-trips a valid token', () => {
    const token = createSessionToken({ uid: 42, sub: 'abc' }, SECRET);
    const payload = verifySessionToken(token, SECRET);
    expect(payload?.uid).toBe(42);
    expect(payload?.sub).toBe('abc');
  });

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken({ uid: 1, sub: 'x' }, SECRET);
    expect(verifySessionToken(token, 'other-secret')).toBeNull();
  });

  it('rejects a tampered payload (signature no longer matches)', () => {
    const token = createSessionToken({ uid: 1, sub: 'x' }, SECRET);
    const sig = token.split('.')[1]!;
    const forgedPayload = Buffer.from(
      JSON.stringify({ uid: 999, sub: 'x', iat: 1, exp: Date.now() + 1e9 }),
    ).toString('base64url');
    expect(verifySessionToken(`${forgedPayload}.${sig}`, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const longAgo = Date.now() - SESSION_TTL_MS - 1000;
    const token = createSessionToken({ uid: 1, sub: 'x' }, SECRET, longAgo);
    expect(verifySessionToken(token, SECRET)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySessionToken('garbage', SECRET)).toBeNull();
    expect(verifySessionToken('a.b.c', SECRET)).toBeNull();
  });
});
