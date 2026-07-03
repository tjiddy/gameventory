import * as oidc from 'openid-client';
import { badGateway, badRequest } from '../utils/http-error.js';

export interface OidcServiceConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OidcProfile {
  subject: string;
  displayName: string;
  email: string | null;
}

interface PendingAuth {
  codeVerifier: string;
  nonce: string;
  createdAt: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000;
const SCOPE = 'openid profile email';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Authelia authorization-code + PKCE client (single-sourced from narratorr-request's
 * generic OidcService, specialized to the one provider). Pending {state→verifier} is
 * held in memory with a short TTL (single-instance).
 */
export class OidcService {
  private configPromise: Promise<oidc.Configuration> | null = null;
  private readonly pending = new Map<string, PendingAuth>();

  constructor(private readonly cfg: OidcServiceConfig) {}

  private async getConfig(): Promise<oidc.Configuration> {
    if (!this.configPromise) {
      this.configPromise = oidc
        .discovery(new URL(this.cfg.issuer), this.cfg.clientId, this.cfg.clientSecret)
        .catch((err: unknown) => {
          this.configPromise = null;
          throw badGateway(`Authelia OIDC discovery failed: ${describe(err)}`, 'OIDC_DISCOVERY');
        });
    }
    return this.configPromise;
  }

  async buildAuthUrl(nowMs = Date.now()): Promise<string> {
    const config = await this.getConfig();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();

    this.sweep(nowMs);
    this.pending.set(state, { codeVerifier, nonce, createdAt: nowMs });

    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.cfg.redirectUri,
      scope: SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return url.href;
  }

  async handleCallback(callbackUrl: string, nowMs = Date.now()): Promise<OidcProfile> {
    const config = await this.getConfig();
    const current = new URL(callbackUrl);
    const state = current.searchParams.get('state');
    if (!state) throw badRequest('missing state', 'OIDC_STATE');
    const pending = this.pending.get(state);
    if (!pending || nowMs - pending.createdAt > PENDING_TTL_MS) {
      throw badRequest('unknown or expired auth state', 'OIDC_STATE');
    }
    this.pending.delete(state);

    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      tokens = await oidc.authorizationCodeGrant(config, current, {
        pkceCodeVerifier: pending.codeVerifier,
        expectedState: state,
        expectedNonce: pending.nonce,
      });
    } catch (err) {
      throw badGateway(`Authelia OIDC token exchange failed: ${describe(err)}`, 'OIDC_EXCHANGE');
    }

    const claims = (tokens.claims() ?? {}) as Record<string, unknown>;
    const subject = str(claims['sub']);
    if (!subject) throw badGateway('Authelia OIDC response had no subject claim', 'OIDC_CLAIMS');
    const displayName = str(claims['preferred_username']) ?? str(claims['name']) ?? subject;
    return { subject, displayName, email: str(claims['email']) ?? null };
  }

  private sweep(nowMs: number): void {
    for (const [state, p] of this.pending) {
      if (nowMs - p.createdAt > PENDING_TTL_MS) this.pending.delete(state);
    }
  }
}
