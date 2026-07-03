export type SleepFn = (ms: number) => Promise<void>;

export const realSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Serializes every BGG request through one chain and enforces a minimum spacing
 * between request starts (~2s). ALL BGG traffic — search, things, tagline scrape —
 * flows through a single instance so we never hammer the API in parallel
 * (MIGRATION-PLAN §7.1). Backoff on 202/429 is layered on top by the adapter.
 *
 * `sleep` is injectable so tests run instantly (spacingMs=0 also skips the wait).
 */
export class BggRequestQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private lastStartMs = 0;

  constructor(
    private readonly spacingMs = 2000,
    private readonly sleep: SleepFn = realSleep,
  ) {}

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async (): Promise<T> => {
      const wait = this.spacingMs - (Date.now() - this.lastStartMs);
      if (wait > 0) await this.sleep(wait);
      this.lastStartMs = Date.now();
      return task();
    });
    // Keep the chain alive whether the task resolved or threw, so one failure
    // doesn't wedge the queue for every later request.
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
