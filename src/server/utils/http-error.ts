/**
 * Typed HTTP error carrying an HTTP status + a machine-readable code. The error
 * handler (plugins/error-handler.ts) maps these to the `{ error: { message, code } }`
 * response envelope (MIGRATION-PLAN §6). Throw these from routes/services; never
 * hand-roll `reply.status(...).send(...)` for error cases.
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST'): HttpError => new HttpError(400, code, message);
export const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED'): HttpError => new HttpError(401, code, message);
export const forbidden = (message = 'Forbidden', code = 'FORBIDDEN'): HttpError => new HttpError(403, code, message);
export const notFound = (message = 'Not found', code = 'NOT_FOUND'): HttpError => new HttpError(404, code, message);
export const conflict = (message: string, code = 'CONFLICT'): HttpError => new HttpError(409, code, message);
