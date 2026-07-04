import { conflict } from '../utils/http-error.js';

/**
 * A process-local reader-writer single-flight lock guarding every path that mutates
 * or snapshots the library (issue #3). Restore is the sole **exclusive** writer;
 * refresh (full/single), background stub hydration, game add/patch/delete, and
 * backup `create()` are **shared** readers that stay mutually concurrent.
 *
 * Acquisition is NON-BLOCKING: a reader that finds a writer active — or a writer
 * that finds any reader/writer active — fails immediately with 409
 * (`OPERATION_IN_PROGRESS`) rather than queueing. Fire-and-forget callers (the
 * weekly cron via refresh, background `hydrateStubs`) use the `try*` variants to
 * skip silently instead of surfacing an error.
 *
 * This is intentionally in-memory and single-process: the app runs as one Fastify
 * process against one SQLite file, so there is no cross-process contention to guard.
 */
export class OperationLock {
  private readers = 0;
  private writerActive = false;

  get isWriterActive(): boolean {
    return this.writerActive;
  }

  get hasReaders(): boolean {
    return this.readers > 0;
  }

  /** Enter shared (reader) mode, returning false if a writer holds the lock. */
  tryAcquireShared(): boolean {
    if (this.writerActive) return false;
    this.readers += 1;
    return true;
  }

  releaseShared(): void {
    if (this.readers > 0) this.readers -= 1;
  }

  /** Run `fn` in shared mode; throw 409 if a writer (restore) is active. */
  async runShared<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.tryAcquireShared()) throw operationInProgress();
    try {
      return await fn();
    } finally {
      this.releaseShared();
    }
  }

  /** Run `fn` in exclusive mode; throw 409 if any reader OR writer is active. */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.writerActive || this.readers > 0) throw operationInProgress();
    this.writerActive = true;
    try {
      return await fn();
    } finally {
      this.writerActive = false;
    }
  }
}

export function operationInProgress(): ReturnType<typeof conflict> {
  return conflict('Another library operation is in progress', 'OPERATION_IN_PROGRESS');
}
