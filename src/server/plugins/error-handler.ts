import type { FastifyInstance, FastifyError, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { serializeError } from '../utils/serialize-error.js';
import { HttpError } from '../utils/http-error.js';

// Response envelope for all error paths (MIGRATION-PLAN §6): { error: { message, code } }.
function sendError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.status(status).send({ error: { message, code } });
}

async function errorHandlerPluginInner(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    // Typed application errors — status + code come straight off the error.
    if (error instanceof HttpError) {
      if (error.statusCode >= 500) {
        request.log.error({ error: serializeError(error) }, error.message);
      } else {
        request.log.warn({ code: error.code }, error.message);
      }
      return sendError(reply, error.statusCode, error.code, error.message);
    }

    // Zod/schema validation failures raised by fastify-type-provider-zod.
    if ('validation' in error && error.validation) {
      return sendError(reply, 400, 'VALIDATION', error.message);
    }

    // Fastify's own errors that carry an explicit 4xx statusCode (e.g. rate limit).
    const statusCode = (error as FastifyError).statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      const code = (error as FastifyError).code ?? 'BAD_REQUEST';
      request.log.warn({ code }, error.message);
      return sendError(reply, statusCode, code, error.message);
    }

    // Untyped errors — 500, generic message (no stack/detail leak to the client).
    request.log.error({ error: serializeError(error) }, error.message || 'Unhandled error');
    return sendError(reply, 500, 'INTERNAL', 'Internal server error');
  });
}

export const errorHandlerPlugin = fp(errorHandlerPluginInner, {
  name: 'error-handler',
});
