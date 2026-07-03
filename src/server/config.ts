import fs from 'fs';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Environment schema (MIGRATION-PLAN §4). Fail boot on invalid input.
//
// Auth/OIDC fields are OPTIONAL here: Phase 0/1 run with AUTH_BYPASS=1 and no
// Authelia configured. Phase 3 wiring calls assertOidcConfigured() when a real
// session flow is needed, so a missing OIDC secret can't silently disable auth
// in a non-bypass deploy.
// ---------------------------------------------------------------------------
const envSchema = z.object({
  NODE_ENV: z.string().default(''),
  PORT: z
    .string()
    .default('3000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535)),
  DATABASE_URL: z
    .string()
    .default('file:./config/gameventory.db')
    .transform((v) => v || 'file:./config/gameventory.db')
    .transform((v) => (v.startsWith('file:') ? v.slice(5) : v)),
  AUTH_BYPASS: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === '1'),
  TRUSTED_PROXIES: z
    .string()
    .optional()
    .transform((v) => {
      const parts = (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      return parts.length === 0 ? false : parts;
    }),
  SESSION_SECRET: z.string().optional(),
  SESSION_SECRET_FILE: z.string().optional(),
  OIDC_AUTHELIA_ISSUER: z.string().optional(),
  OIDC_AUTHELIA_CLIENT_ID: z.string().optional(),
  OIDC_AUTHELIA_CLIENT_SECRET: z.string().optional(),
  OIDC_AUTHELIA_CLIENT_SECRET_FILE: z.string().optional(),
  OIDC_AUTHELIA_REDIRECT_URI: z.string().optional(),
  // `authelia:<subject-uuid>` — the single admin allowed through the OIDC callback.
  BOOTSTRAP_ADMIN: z.string().optional(),
  // BGG XML API bearer token (required since BGG's Oct-2025 auth lockdown). Register
  // the app at https://boardgamegeek.com/using_the_xml_api to obtain one.
  BGG_API_TOKEN: z.string().optional(),
  BGG_API_TOKEN_FILE: z.string().optional(),
  // Weekly refresh cron (croner). Default: Mondays 04:00.
  REFRESH_CRON: z.string().default('0 4 * * 1').transform((v) => v || '0 4 * * 1'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment config: ${parsed.error.message}`);
}
const env = parsed.data;

/** Read a secret from its `_FILE` path if given, else the inline value. */
function resolveSecret(inline: string | undefined, filePath: string | undefined): string | undefined {
  if (filePath) {
    return fs.readFileSync(filePath, 'utf-8').trim();
  }
  return inline;
}

const isProd = env.NODE_ENV === 'production';

// AUTH_BYPASS is a dev-only escape hatch. Refuse it in production so a stray env
// var can never disable the auth boundary on the live deploy (§9).
if (env.AUTH_BYPASS && isProd) {
  throw new Error('AUTH_BYPASS must not be enabled with NODE_ENV=production');
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const sessionSecret = resolveSecret(env.SESSION_SECRET, env.SESSION_SECRET_FILE);
const oidcClientSecret = resolveSecret(env.OIDC_AUTHELIA_CLIENT_SECRET, env.OIDC_AUTHELIA_CLIENT_SECRET_FILE);
const bggApiToken = resolveSecret(env.BGG_API_TOKEN, env.BGG_API_TOKEN_FILE);

const oidc: OidcConfig | null =
  env.OIDC_AUTHELIA_ISSUER && env.OIDC_AUTHELIA_CLIENT_ID && oidcClientSecret && env.OIDC_AUTHELIA_REDIRECT_URI
    ? {
        issuer: env.OIDC_AUTHELIA_ISSUER,
        clientId: env.OIDC_AUTHELIA_CLIENT_ID,
        clientSecret: oidcClientSecret,
        redirectUri: env.OIDC_AUTHELIA_REDIRECT_URI,
      }
    : null;

export const config = {
  nodeEnv: env.NODE_ENV,
  isProd,
  isDev: !isProd,
  port: env.PORT,
  // AUTH_BYPASS binds loopback-only so the bypassed admin is never reachable off-host.
  bindHost: env.AUTH_BYPASS ? '127.0.0.1' : '0.0.0.0',
  dbPath: env.DATABASE_URL,
  authBypass: env.AUTH_BYPASS,
  trustedProxies: env.TRUSTED_PROXIES,
  sessionSecret,
  oidc,
  bootstrapAdmin: env.BOOTSTRAP_ADMIN,
  bggApiToken,
  refreshCron: env.REFRESH_CRON,
  logLevel: env.LOG_LEVEL,
  version: process.env.GIT_COMMIT || 'dev',
};

export interface RequiredOidc {
  oidc: OidcConfig;
  sessionSecret: string;
  bootstrapAdmin: string;
}

/** Return the OIDC config + session secret + bootstrap admin, or throw (Phase 3). */
export function requireOidcConfig(): RequiredOidc {
  if (!config.oidc) throw new Error('OIDC is not configured (OIDC_AUTHELIA_* env vars missing)');
  if (!config.sessionSecret) throw new Error('SESSION_SECRET(_FILE) is required for the auth session');
  if (!config.bootstrapAdmin) throw new Error('BOOTSTRAP_ADMIN is required (authelia:<subject-uuid>)');
  return { oidc: config.oidc, sessionSecret: config.sessionSecret, bootstrapAdmin: config.bootstrapAdmin };
}

export type AppConfig = typeof config;
