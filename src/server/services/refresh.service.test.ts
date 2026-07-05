import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../test-support/db.js';
import { makeThing, makeFakeBgg, silentLogger } from '../test-support/fakes.js';
import { GameStore } from './game-store.js';
import { RefreshService } from './refresh.service.js';
import type { Db } from '../../db/index.js';
import type { BggThing } from '../../core/bgg/index.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A GameStore whose metadata write throws for one specific bggId — the minimal
 * seam to exercise the per-row error branch in RefreshService.runAll (:92-93). */
class ThrowingStore extends GameStore {
  constructor(db: Db, private readonly throwForBggId: number) {
    super(db);
  }
  override async applyBggDerived(id: number, thing: BggThing, now: Date): Promise<void> {
    if (thing.bggId === this.throwForBggId) throw new Error(`apply blew up for ${thing.bggId}`);
    return super.applyBggDerived(id, thing, now);
  }
}

describe('RefreshService.runAll — resilience (§8)', () => {
  it('records both omitted and errored games as failures, updates the healthy one, and completes', async () => {
    const db = await makeTestDb();
    const store = new ThrowingStore(db, 2); // applyBggDerived throws for bggId 2
    const now = new Date();
    for (const bggId of [1, 2, 3]) {
      await store.insertGame({
        bggId, type: 'base', owned: true, played: false,
        createTime: now, name: `Original ${bggId}`, updateTime: now,
      });
    }
    // BGG returns 1 and 2 but omits 3.
    const bgg = makeFakeBgg({
      things: {
        1: makeThing({ bggId: 1, name: 'Healthy One', rank: 42 }),
        2: makeThing({ bggId: 2, name: 'Boom Two' }),
      },
    });
    const refresh = new RefreshService(store, bgg, silentLogger);

    await refresh.startAll();
    while (refresh.isRunning) await sleep(5);

    const status = refresh.getStatus();
    // The run completed rather than aborting on the first bad game.
    expect(status.state).toBe('idle');
    expect(status.current).toBe(status.total);
    expect(status.total).toBe(3);

    const omitted = status.failures.find((f) => f.bggId === 3);
    const errored = status.failures.find((f) => f.bggId === 2);
    expect(omitted?.reason).toBe('Not returned by BGG');
    expect(errored?.reason).toContain('apply blew up');
    expect(status.failures.map((f) => f.bggId).sort()).toEqual([2, 3]);

    // The healthy game got its BGG-derived update despite the failures around it.
    const healthy = await store.getByBggId(1);
    expect(healthy?.name).toBe('Healthy One');
    expect(healthy?.rank).toBe(42);
    expect(healthy?.hydrated).toBe(true);
    // The errored game's user state / metadata were not partially applied by refresh.
    expect((await store.getByBggId(2))?.hydrated).toBe(false);
  });

  it('batches getThings into chunks of BATCH_SIZE (20)', async () => {
    const db = await makeTestDb();
    const store = new GameStore(db);
    const now = new Date();
    const things: Record<number, BggThing> = {};
    for (let bggId = 1; bggId <= 25; bggId++) {
      await store.insertGame({
        bggId, type: 'base', owned: true, played: false,
        createTime: now, name: `Game ${bggId}`, updateTime: now,
      });
      things[bggId] = makeThing({ bggId });
    }
    const bgg = makeFakeBgg({ things });
    const refresh = new RefreshService(store, bgg, silentLogger);

    await refresh.startAll();
    while (refresh.isRunning) await sleep(5);

    // 25 rows → two batches of ≤20 (20 + 5).
    expect(bgg.getThingsCalls.map((c) => c.length)).toEqual([20, 5]);
    // Every id was requested exactly once, across the two batches.
    expect(bgg.getThingsCalls.flat().sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
    expect(refresh.getStatus().current).toBe(25);
  });
});
