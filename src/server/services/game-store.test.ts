import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../test-support/db.js';
import { GameStore } from './game-store.js';
import type { NewGameRow } from '../../db/schema.js';

function baseRow(over: Partial<NewGameRow> & { bggId: number }): NewGameRow {
  const now = new Date('2024-01-02T03:04:05.000Z');
  return {
    type: 'base',
    owned: true,
    played: false,
    createTime: now,
    name: `Game ${over.bggId}`,
    updateTime: now,
    ...over,
  };
}

async function makeStore(): Promise<GameStore> {
  return new GameStore(await makeTestDb());
}

describe('GameStore.syncExpansions — orphan reconciliation (§8.3)', () => {
  it('drops junctions for removed links, deleting the unowned orphan but keeping the owned one', async () => {
    const store = await makeStore();
    const base = await store.insertGame(baseRow({ bggId: 13, name: 'Catan' }));
    const now = new Date();
    // Create both expansion stubs (owned=false) + junctions.
    await store.syncExpansions(base.id, [
      { bggId: 926, name: 'Seafarers' },
      { bggId: 927, name: 'Cities & Knights' },
    ], now);
    // The user marks one expansion owned; leave the other unowned.
    await store.updateUserState(926, { owned: true });

    // Re-run with an empty link set — BGG no longer reports either expansion.
    await store.syncExpansions(base.id, [], now);

    // Both junctions are gone.
    expect(await store.getExpansionsForBase(base.id)).toEqual([]);
    // The owned orphan survives (deleteIfOrphan's `!owned` guard); the unowned one is deleted.
    expect(await store.getByBggId(926)).toBeDefined();
    expect(await store.getByBggId(927)).toBeUndefined();
  });

  it('keeps a shared expansion when only one of its bases drops the link', async () => {
    const store = await makeStore();
    const base1 = await store.insertGame(baseRow({ bggId: 13, name: 'Base One' }));
    const base2 = await store.insertGame(baseRow({ bggId: 14, name: 'Base Two' }));
    const exp = await store.insertGame(
      baseRow({ bggId: 926, type: 'expansion', name: 'Shared Exp', owned: false }),
    );
    await store.linkExpansion(base1.id, exp.id);
    await store.linkExpansion(base2.id, exp.id);

    // base1 no longer reports the expansion; base2 still does.
    await store.syncExpansions(base1.id, [], new Date());

    expect(await store.getExpansionsForBase(base1.id)).toEqual([]);
    // The expansion row survives because base2's junction still references it.
    expect(await store.getByBggId(926)).toBeDefined();
    expect((await store.getExpansionsForBase(base2.id)).map((r) => r.bggId)).toEqual([926]);
  });
});

describe('GameStore.deleteBase — orphan behavior', () => {
  it('deletes an OWNED orphaned expansion (diverges from syncExpansions/deleteIfOrphan)', async () => {
    const store = await makeStore();
    const base = await store.insertGame(baseRow({ bggId: 13, name: 'Catan' }));
    const exp = await store.insertGame(
      baseRow({ bggId: 926, type: 'expansion', name: 'Seafarers', owned: true }),
    );
    await store.linkExpansion(base.id, exp.id);

    expect(await store.deleteBase(13)).toBe('ok');
    expect(await store.getByBggId(13)).toBeUndefined();
    // deleteBase drops the orphan regardless of owned (game-store.ts:221-224).
    expect(await store.getByBggId(926)).toBeUndefined();
  });

  it('retains an expansion still junctioned to another surviving base', async () => {
    const store = await makeStore();
    const base1 = await store.insertGame(baseRow({ bggId: 13, name: 'Base One' }));
    const base2 = await store.insertGame(baseRow({ bggId: 14, name: 'Base Two' }));
    const exp = await store.insertGame(
      baseRow({ bggId: 926, type: 'expansion', name: 'Shared Exp', owned: false }),
    );
    await store.linkExpansion(base1.id, exp.id);
    await store.linkExpansion(base2.id, exp.id);

    expect(await store.deleteBase(13)).toBe('ok');
    // Still referenced by base2 → survives.
    expect(await store.getByBggId(926)).toBeDefined();
    expect((await store.getExpansionsForBase(base2.id)).map((r) => r.bggId)).toEqual([926]);
  });
});

describe('GameStore.updateUserState', () => {
  it('is a no-op returning the unchanged row for an empty patch', async () => {
    const store = await makeStore();
    await store.insertGame(baseRow({ bggId: 13, owned: true, played: true }));

    const row = await store.updateUserState(13, {});
    expect(row?.bggId).toBe(13);
    expect(row?.owned).toBe(true); // untouched
    expect(row?.played).toBe(true); // untouched
  });

  it('sets played=true on an owned game while leaving owned=true', async () => {
    const store = await makeStore();
    await store.insertGame(baseRow({ bggId: 13, owned: true, played: false }));

    const row = await store.updateUserState(13, { played: true });
    expect(row?.played).toBe(true);
    expect(row?.owned).toBe(true);
  });
});
