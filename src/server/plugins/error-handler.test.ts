import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorHandlerPlugin } from './error-handler.js';
import { notFound } from '../utils/http-error.js';

/**
 * A minimal app mirroring the production Fastify wiring the error handler needs —
 * Zod compilers so the validation branch actually raises a
 * `fastify-type-provider-zod` error — plus one throwaway route per error branch.
 */
async function buildHarness(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(errorHandlerPlugin);

  app.get('/boom', () => {
    throw new Error('boom /secret?token=abc');
  });
  app.get('/gone', () => {
    throw notFound('gone');
  });
  app.withTypeProvider<ZodTypeProvider>().post(
    '/validate',
    { schema: { body: z.object({ n: z.number() }) } },
    () => ({ ok: true }),
  );

  await app.ready();
  return app;
}

describe('errorHandlerPlugin envelope', () => {
  it('untyped Error → 500 generic envelope with no raw message/stack leak', async () => {
    const app = await buildHarness();
    try {
      const res = await app.inject({ method: 'GET', url: '/boom' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: { message: 'Internal server error', code: 'INTERNAL' } });
      // Info-leak guard: neither the raw message nor a stack reaches the client.
      expect(res.body).not.toContain('/secret?token=abc');
      expect(res.body).not.toContain('at ');
    } finally {
      await app.close();
    }
  });

  it('HttpError (notFound) → 404 carrying its message + code', async () => {
    const app = await buildHarness();
    try {
      const res = await app.inject({ method: 'GET', url: '/gone' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: { message: 'gone', code: 'NOT_FOUND' } });
    } finally {
      await app.close();
    }
  });

  it('Zod validation failure → 400 VALIDATION', async () => {
    const app = await buildHarness();
    try {
      const res = await app.inject({ method: 'POST', url: '/validate', payload: { n: 'not-a-number' } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
    } finally {
      await app.close();
    }
  });
});
