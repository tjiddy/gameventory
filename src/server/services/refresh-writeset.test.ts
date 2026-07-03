import { describe, it, expect } from 'vitest';
import { count } from 'drizzle-orm';
import { makeTestDb } from '../test-support/db.js';
import { makeThing, makeFakeBgg, silentLogger } from '../test-support/fakes.js';
import { gameStatHistory } from '../../db/schema.js';
import { GameStore } from './game-store.js';
import { RefreshService } from './refresh.service.js';
import { buildBggDerivedUpdate, BGG_DERIVED_COLUMNS } from './bgg-derived.js';

describe('BGG-derived write-set enforcement (§0.3 / §12.1)', () => {
  it('buildBggDerivedUpdate produces exactly the allowed columns, no user-state keys', () => {
    const update = buildBggDerivedUpdate(makeThing({ bggId: 13 }), new Date());
    expect(Object.keys(update).sort()).toEqual([...BGG_DERIVED_COLUMNS].sort());
    for (const forbidden of ['owned', 'played', 'createTime', 'type', 'tagline', 'bggId']) {
      expect(Object.keys(update)).not.toContain(forbidden);
    }
  });

  it('a full refresh run never mutates owned / played / createTime / type', async () => {
    const db = await makeTestDb();
    const store = new GameStore(db);
    const createTime = new Date('2021-06-15T12:00:00.000Z');
    // Seed a base game with deliberately POISONED user state.
    const seeded = await store.insertGame({
      bggId: 13,
      type: 'base',
      owned: false,
      played: true,
      createTime,
      name: 'Original Name',
      updateTime: createTime,
    });

    // The incoming BGG thing claims a different type and new metadata — refresh must
    // apply the metadata but ignore anything touching user state or type.
    const thing = makeThing({ bggId: 13, name: 'Refreshed Name', type: 'expansion', rank: 42 });
    const refresh = new RefreshService(store, makeFakeBgg({ things: { 13: thing } }), silentLogger);
    await refresh.startAll();
    // startAll runs in the background; poll until it settles.
    while (refresh.isRunning) await new Promise((r) => setTimeout(r, 5));

    const after = await store.getByBggId(13);
    expect(after?.owned).toBe(false); // unchanged
    expect(after?.played).toBe(true); // unchanged
    expect(after?.createTime.getTime()).toBe(createTime.getTime()); // unchanged
    expect(after?.type).toBe('base'); // NOT demoted despite thing.type === 'expansion'
    expect(after?.id).toBe(seeded.id);
    // …but BGG-derived metadata DID update.
    expect(after?.name).toBe('Refreshed Name');
    expect(after?.rank).toBe(42);
    expect(after?.hydrated).toBe(true);
  });

  it('records a stat-history sample per refreshed game (deduped per UTC day)', async () => {
    const db = await makeTestDb();
    const store = new GameStore(db);
    const now = new Date();
    await store.insertGame({
      bggId: 13, type: 'base', owned: true, played: false, createTime: now, name: 'Catan', updateTime: now,
    });
    const refresh = new RefreshService(store, makeFakeBgg({ things: { 13: makeThing({ bggId: 13, rank: 100 }) } }), silentLogger);
    await refresh.runSingle(13);
    await refresh.runSingle(13); // second run same day — the unique constraint dedupes

    const rows = await db.select({ c: count() }).from(gameStatHistory).all();
    expect(rows[0]?.c).toBe(1);
  });
});
