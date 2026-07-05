import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as oidc from 'openid-client';
import { OidcService, type OidcServiceConfig } from './oidc.service.js';

// The service uses a namespace import (`import * as oidc`); mock the whole module.
vi.mock('openid-client', () => ({
  discovery: vi.fn(),
  randomPKCECodeVerifier: vi.fn(),
  calculatePKCECodeChallenge: vi.fn(),
  randomState: vi.fn(),
  randomNonce: vi.fn(),
  buildAuthorizationUrl: vi.fn(),
  authorizationCodeGrant: vi.fn(),
}));

const mocked = vi.mocked(oidc);

const CFG: OidcServiceConfig = {
  issuer: 'https://authelia.example',
  clientId: 'gameventory',
  clientSecret: 'shhh',
  redirectUri: 'https://app.example/api/auth/oidc/authelia/callback',
};

const STATE = 'state-fixed-123';
const VERIFIER = 'verifier-abc';
const NONCE = 'nonce-789';
const CALLBACK = `${CFG.redirectUri}?state=${STATE}&code=the-code`;
const PENDING_TTL_MS = 10 * 60 * 1000;

/** Resolve authorizationCodeGrant to a token whose claims() returns `claims`. */
function grantWith(claims: Record<string, unknown>): void {
  mocked.authorizationCodeGrant.mockResolvedValue({
    claims: () => claims,
  } as unknown as oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers);
}

async function expectHttpError(p: Promise<unknown>, statusCode: number, code: string): Promise<void> {
  await expect(p).rejects.toMatchObject({ statusCode, code });
}

function makeService(): OidcService {
  return new OidcService(CFG);
}

/** Seed the private `pending` map with STATE by driving buildAuthUrl (createdAt = nowMs). */
async function seed(svc: OidcService, nowMs = 0): Promise<void> {
  await svc.buildAuthUrl(nowMs);
}

describe('OidcService.handleCallback (OIDC state machine)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.discovery.mockResolvedValue({} as oidc.Configuration);
    mocked.randomPKCECodeVerifier.mockReturnValue(VERIFIER);
    mocked.calculatePKCECodeChallenge.mockResolvedValue('challenge-xyz');
    mocked.randomState.mockReturnValue(STATE);
    mocked.randomNonce.mockReturnValue(NONCE);
    mocked.buildAuthorizationUrl.mockReturnValue(new URL(`https://authelia.example/authorize?state=${STATE}`));
    grantWith({ sub: 'admin-subject', preferred_username: 'todd', email: 'todd@example.com' });
  });

  it('rejects a callback missing the state query param → OIDC_STATE (400)', async () => {
    const svc = makeService();
    await expectHttpError(svc.handleCallback(`${CFG.redirectUri}?code=x`, 0), 400, 'OIDC_STATE');
  });

  it('rejects an unknown / never-issued state → OIDC_STATE (400)', async () => {
    const svc = makeService();
    // No buildAuthUrl call, so `pending` never holds STATE.
    await expectHttpError(svc.handleCallback(CALLBACK, 0), 400, 'OIDC_STATE');
  });

  it('rejects an expired state and treats the TTL boundary as inclusive', async () => {
    const svc = makeService();
    await seed(svc, 0);
    // One ms past the TTL is expired.
    await expectHttpError(svc.handleCallback(CALLBACK, PENDING_TTL_MS + 1), 400, 'OIDC_STATE');

    // Exactly at the TTL boundary is still valid (nowMs - createdAt > TTL is false).
    await seed(svc, 0);
    const profile = await svc.handleCallback(CALLBACK, PENDING_TTL_MS);
    expect(profile.subject).toBe('admin-subject');
  });

  it('is single-use: a replayed state throws OIDC_STATE the second time', async () => {
    const svc = makeService();
    await seed(svc, 0);
    await svc.handleCallback(CALLBACK, 0);
    await expectHttpError(svc.handleCallback(CALLBACK, 0), 400, 'OIDC_STATE');
  });

  it('consumes the state even when the token exchange fails (delete precedes exchange)', async () => {
    const svc = makeService();
    await seed(svc, 0);
    mocked.authorizationCodeGrant.mockRejectedValueOnce(new Error('boom'));
    await expectHttpError(svc.handleCallback(CALLBACK, 0), 502, 'OIDC_EXCHANGE');
    // State was deleted before the (failed) exchange, so a retry is now unknown.
    await expectHttpError(svc.handleCallback(CALLBACK, 0), 400, 'OIDC_STATE');
  });

  it('exchanges the code with the stored verifier, expected state, and nonce', async () => {
    const svc = makeService();
    await seed(svc, 0);
    await svc.handleCallback(CALLBACK, 0);
    expect(mocked.authorizationCodeGrant).toHaveBeenCalledTimes(1);
    const [config, url, opts] = mocked.authorizationCodeGrant.mock.calls[0]!;
    expect(config).toEqual({});
    expect((url as URL).href).toBe(CALLBACK);
    expect(opts).toEqual({ pkceCodeVerifier: VERIFIER, expectedState: STATE, expectedNonce: NONCE });
  });

  it('maps a token-exchange failure to OIDC_EXCHANGE (502)', async () => {
    const svc = makeService();
    await seed(svc, 0);
    mocked.authorizationCodeGrant.mockRejectedValueOnce(new Error('token endpoint down'));
    await expectHttpError(svc.handleCallback(CALLBACK, 0), 502, 'OIDC_EXCHANGE');
  });

  it('maps a claims payload with no sub to OIDC_CLAIMS (502)', async () => {
    const svc = makeService();
    await seed(svc, 0);
    grantWith({ preferred_username: 'todd' });
    await expectHttpError(svc.handleCallback(CALLBACK, 0), 502, 'OIDC_CLAIMS');
  });

  it('maps full claims to a profile', async () => {
    const svc = makeService();
    await seed(svc, 0);
    grantWith({ sub: 'abc-123', preferred_username: 'todd', email: 'todd@example.com' });
    const profile = await svc.handleCallback(CALLBACK, 0);
    expect(profile).toEqual({ subject: 'abc-123', displayName: 'todd', email: 'todd@example.com' });
  });

  it('falls back displayName preferred_username → name → subject', async () => {
    const svc = makeService();

    await seed(svc, 0);
    grantWith({ sub: 's1', preferred_username: 'pref', name: 'Full Name' });
    expect((await svc.handleCallback(CALLBACK, 0)).displayName).toBe('pref');

    await seed(svc, 0);
    grantWith({ sub: 's2', name: 'Full Name' });
    expect((await svc.handleCallback(CALLBACK, 0)).displayName).toBe('Full Name');

    await seed(svc, 0);
    grantWith({ sub: 's3' });
    expect((await svc.handleCallback(CALLBACK, 0)).displayName).toBe('s3');
  });

  it('maps an absent or empty email to null', async () => {
    const svc = makeService();

    await seed(svc, 0);
    grantWith({ sub: 's1' });
    expect((await svc.handleCallback(CALLBACK, 0)).email).toBeNull();

    await seed(svc, 0);
    grantWith({ sub: 's2', email: '' });
    expect((await svc.handleCallback(CALLBACK, 0)).email).toBeNull();
  });
});
