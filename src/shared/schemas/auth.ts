import { z } from 'zod';

export const AuthUser = z.object({ displayName: z.string() });

/** GET /api/auth/me — the current admin, or null when anonymous. */
export const AuthMeResponse = z.object({ user: AuthUser.nullable() });
export type AuthMeResponse = z.infer<typeof AuthMeResponse>;
