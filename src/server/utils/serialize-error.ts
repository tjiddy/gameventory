/** Serialized error shape safe for Pino JSON logging. */
export interface SerializedError {
  message: string;
  stack?: string | undefined;
  type: string;
  code?: string | undefined;
  cause?: SerializedError | undefined;
}

const MAX_CAUSE_DEPTH = 5;

// Match http(s) URLs / magnet URIs embedded in messages so a transport library
// (undici) that writes a secret-bearing URL into err.message doesn't leak it.
const URL_IN_MESSAGE_RE = /(https?:\/\/[^\s'"<>`)]+|magnet:\?[^\s'"<>`)]+)/g;

function redactUrl(match: string): string {
  const q = match.indexOf('?');
  return q === -1 ? match : `${match.slice(0, q)}?…`;
}

function redactUrlsIn(text: string | undefined): string | undefined {
  if (!text) return text;
  return text.replace(URL_IN_MESSAGE_RE, redactUrl);
}

/**
 * Serialize an unknown caught value into a Pino-safe object. Pino's built-in
 * serializers only handle the `err` key for real Error instances; a
 * `catch (error: unknown)` binding logged as `{ error }` produces `"error":{}`.
 * This preserves message/stack/type/code/cause and redacts URL query strings.
 */
export function serializeError(err: unknown): SerializedError {
  try {
    return serialize(err, new Set([err]), 0);
  } catch {
    return { message: redactUrlsIn(String(err)) ?? String(err), type: typeof err };
  }
}

function serialize(err: unknown, seen: Set<unknown>, depth: number): SerializedError {
  if (!(err instanceof Error)) {
    return { message: redactUrlsIn(String(err)) ?? String(err), type: typeof err };
  }

  const result: SerializedError = {
    message: redactUrlsIn(err.message) ?? err.message,
    stack: redactUrlsIn(err.stack),
    type: err.constructor.name,
  };

  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string') {
    result.code = code;
  }

  if (err.cause !== undefined && depth < MAX_CAUSE_DEPTH && !seen.has(err.cause)) {
    seen.add(err.cause);
    result.cause = serialize(err.cause, seen, depth + 1);
  }

  return result;
}
