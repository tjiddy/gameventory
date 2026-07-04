import type { FastifyBaseLogger } from 'fastify';
import type { GameStore, RefreshRow } from './game-store.js';
import type { BggPort, BggThing } from '../../core/bgg/index.js';
import { OperationLock } from './operation-lock.js';
import { serializeError } from '../utils/serialize-error.js';
import { conflict, notFound } from '../utils/http-error.js';
import type { RefreshStatus } from '../../shared/schemas/index.js';

const BATCH_SIZE = 20;
const utcDay = (d: Date): string => d.toISOString().slice(0, 10);
const errMsg = (e: unknown): string => serializeError(e).message;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Owns the refresh/hydration machinery and the in-memory status served to the UI
 * (§8). One full run at a time; single-game refresh 409s while a
 * full run is active. Only BGG-derived columns are written (via GameStore).
 */
export class RefreshService {
  private status: RefreshStatus = {
    state: 'idle',
    current: 0,
    total: 0,
    currentGameName: null,
    startedAt: null,
    finishedAt: null,
    failures: [],
  };

  constructor(
    private readonly store: GameStore,
    private readonly bgg: BggPort,
    private readonly log: FastifyBaseLogger,
    private readonly lock: OperationLock = new OperationLock(),
  ) {}

  get isRunning(): boolean {
    return this.status.state === 'running';
  }

  getStatus(): RefreshStatus {
    return { ...this.status, failures: [...this.status.failures] };
  }

  /** Start a full refresh (background). Throws 409 if one is already running or a
   * restore (exclusive writer) holds the operation lock. The shared reader is held
   * for the whole background run so a restore can't start mid-refresh. */
  async startAll(): Promise<void> {
    if (this.isRunning) throw conflict('A refresh is already running', 'REFRESH_RUNNING');
    if (!this.lock.tryAcquireShared()) {
      throw conflict('Another library operation is in progress', 'OPERATION_IN_PROGRESS');
    }
    let rows: RefreshRow[];
    try {
      rows = await this.store.listAllForRefresh();
    } catch (e: unknown) {
      this.lock.releaseShared();
      throw e;
    }
    this.status = {
      state: 'running',
      current: 0,
      total: rows.length,
      currentGameName: null,
      startedAt: Date.now(),
      finishedAt: null,
      failures: [],
    };
    void this.runAll(rows).finally(() => this.lock.releaseShared());
  }

  private async runAll(rows: RefreshRow[]): Promise<void> {
    try {
      for (const batch of chunk(rows, BATCH_SIZE)) {
        const { things } = await this.bgg.getThings(batch.map((r) => r.bggId));
        const byId = new Map(things.map((t) => [t.bggId, t]));
        for (const row of batch) {
          const thing = byId.get(row.bggId);
          this.status.current += 1;
          if (!thing) {
            this.status.failures.push({ bggId: row.bggId, name: row.name, reason: 'Not returned by BGG' });
            continue;
          }
          this.status.currentGameName = thing.name;
          try {
            await this.applyThing(row, thing, new Date(), false);
          } catch (e: unknown) {
            this.status.failures.push({ bggId: row.bggId, name: row.name, reason: errMsg(e) });
          }
        }
      }
    } catch (e: unknown) {
      this.log.error({ error: serializeError(e) }, 'Refresh-all aborted');
    } finally {
      this.status.state = 'idle';
      this.status.currentGameName = null;
      this.status.finishedAt = Date.now();
    }
  }

  /** Refresh a single game now (writes tagline too). 409 while a full run is active
   * or a restore holds the operation lock. */
  async runSingle(bggId: number): Promise<void> {
    if (this.isRunning) throw conflict('A full refresh is running', 'REFRESH_RUNNING');
    return this.lock.runShared(async () => {
      const row = await this.store.getByBggId(bggId);
      if (!row) throw notFound('Game not found', 'NOT_FOUND');
      const { things } = await this.bgg.getThings([bggId]);
      const thing = things[0];
      if (!thing) throw notFound('Game not found on BoardGameGeek', 'BGG_NOT_FOUND');
      await this.applyThing(row, thing, new Date(), true);
    });
  }

  /** Background hydration of freshly-created stubs (post-add). Never throws. Skips
   * silently (no BGG calls, no stale writes) when a restore holds the lock. */
  async hydrateStubs(bggIds: number[]): Promise<void> {
    if (bggIds.length === 0) return;
    if (!this.lock.tryAcquireShared()) {
      this.log.info('Skipping stub hydration — a library operation is in progress');
      return;
    }
    try {
      const { things } = await this.bgg.getThings(bggIds);
      const now = new Date();
      for (const thing of things) {
        const row = await this.store.getByBggId(thing.bggId);
        if (row) await this.applyThing(row, thing, now, false);
      }
    } catch (e: unknown) {
      this.log.warn({ error: serializeError(e) }, 'Stub hydration failed');
    } finally {
      this.lock.releaseShared();
    }
  }

  private async applyThing(
    row: RefreshRow,
    thing: BggThing,
    now: Date,
    withTagline: boolean,
  ): Promise<void> {
    await this.store.applyBggDerived(row.id, thing, now);
    if (row.type === 'base') await this.store.syncExpansions(row.id, thing.expansionLinks, now);
    if (withTagline) {
      const tagline = await this.bgg.scrapeTagline(thing.bggId);
      if (tagline) await this.store.setTagline(row.id, tagline);
    }
    await this.store.insertStatSample(row.id, thing, utcDay(now));
  }
}
