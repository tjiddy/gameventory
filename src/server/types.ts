import type { AuthUser } from './services/user.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The authenticated admin for this request, or null when anonymous. */
    user: AuthUser | null;
  }
}

export {};
