/** Base class for all BGG adapter failures. Carries a machine-readable code. */
export class BggError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'BggError';
  }
}

/** A BGG HTTP request that never resolved to 200 (after retries/backoff). */
export class BggRequestError extends BggError {
  constructor(
    public readonly url: string,
    public readonly status: number,
  ) {
    super(`BGG request failed (${status})`, 'BGG_REQUEST_FAILED');
    this.name = 'BggRequestError';
  }
}

/** BGG returned a payload that did not match the expected XML shape. */
export class BggParseError extends BggError {
  constructor(message: string) {
    super(message, 'BGG_PARSE_FAILED');
    this.name = 'BggParseError';
  }
}
