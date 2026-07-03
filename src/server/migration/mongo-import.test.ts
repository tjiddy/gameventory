import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../test-support/db.js';
import { GameStore } from '../services/game-store.js';
import { coerceDocs, scanExport, buildSeedPlan, seedFromPlan, parseCreateTime } from './mongo-import.js';

// A representative export (§12.5): multi-parent expansion, a type conflict, all
// three create_time formats, a chimera doc, and (separately) a duplicate id.
const EXPORT: unknown[] = [
  {
    bgg_id: 13, name: 'Catan', owned: true, played: false, tagline: 'Trade & build',
    create_time: '2022-01-01T00:00:00Z', // ISO string
    expansions: [
      { bgg_id: 926, name: 'Seafarers', owned: false, played: false },
      { bgg_id: 927, name: 'Cities & Knights', owned: false },
    ],
  },
  {
    bgg_id: 999, name: 'Gloomhaven', owned: true, played: true,
    create_time: { $date: '2021-06-15T12:00:00.000Z' }, // extended JSON string
    expansions: [{ bgg_id: 926, name: 'Seafarers', owned: true, played: true }], // 926 multi-parent
  },
  {
    bgg_id: 555, name: 'Test Game',
    create_time: { $date: { $numberLong: '1640995200000' } }, // extended JSON numberLong
    expansions: [{ bgg_id: 999, name: 'dup-as-expansion' }], // 999 is also top-level → type conflict
  },
  { bgg_id: 777, name: '', create_time: 'not-a-date' }, // chimera (no name) + unparseable time
];

describe('mongo export scan (§11.2)', () => {
  it('reports type conflicts, chimeras, and unparseable times without aborting a clean export', () => {
    const report = scanExport(coerceDocs(EXPORT));
    expect(report.topLevelCount).toBe(4);
    expect(report.duplicateBggIds).toEqual([]);
    expect(report.typeConflicts).toEqual([999]); // 999 is embedded under 555 but also top-level
    expect(report.chimeraDocs).toEqual([777]);
    expect(report.createTimeUnparseable).toEqual([777]);
    expect(report.abort).toBe(false);
  });

  it('aborts on a duplicate top-level bgg_id', () => {
    const report = scanExport(coerceDocs([{ bgg_id: 13, name: 'A' }, { bgg_id: 13, name: 'B' }]));
    expect(report.duplicateBggIds).toEqual([13]);
    expect(report.abort).toBe(true);
  });
});

describe('create_time parsing (§11.2)', () => {
  it('parses ISO strings, extended JSON, and numberLong', () => {
    expect(parseCreateTime('2022-01-01T00:00:00Z')?.getUTCFullYear()).toBe(2022);
    expect(parseCreateTime({ $date: '2021-06-15T12:00:00.000Z' })?.getUTCFullYear()).toBe(2021);
    expect(parseCreateTime({ $date: { $numberLong: '1640995200000' } })?.getTime()).toBe(1640995200000);
    expect(parseCreateTime('not-a-date')).toBeNull();
  });
});

describe('seed plan (§11.3)', () => {
  it('OR-merges a multi-parent expansion and flags the disagreement', () => {
    const plan = buildSeedPlan(coerceDocs(EXPORT), new Date());
    const seafarers = plan.expansions.find((e) => e.bggId === 926);
    expect(seafarers?.owned).toBe(true); // false ∨ true
    expect(seafarers?.played).toBe(true);
    expect(seafarers?.parents.sort()).toEqual([13, 999]);
    expect(plan.mergeConflicts).toContain(926); // copies disagreed on owned
    // 999 must NOT be materialized as an expansion (top-level wins).
    expect(plan.expansions.find((e) => e.bggId === 999)).toBeUndefined();
  });

  it('falls back to now for an unparseable create_time', () => {
    const now = new Date('2030-01-01T00:00:00Z');
    const plan = buildSeedPlan(coerceDocs(EXPORT), now);
    expect(plan.bases.find((b) => b.bggId === 777)?.createTime.getTime()).toBe(now.getTime());
    expect(plan.bases.find((b) => b.bggId === 777)?.name).toBe('Game 777');
  });
});

describe('seed into the DB (§11.3)', () => {
  it('inserts base + expansion rows and junctions with merged ownership', async () => {
    const db = await makeTestDb();
    const store = new GameStore(db);
    const now = new Date();
    const counts = await seedFromPlan(store, buildSeedPlan(coerceDocs(EXPORT), now), now);

    expect(counts.baseCount).toBe(4);
    expect(counts.expansionCount).toBe(2); // 926, 927 (not 999)
    expect((await store.listBase()).map((g) => g.bggId).sort((a, b) => a - b)).toEqual([13, 555, 777, 999]);

    const seafarers = await store.getByBggId(926);
    expect(seafarers?.type).toBe('expansion');
    expect(seafarers?.owned).toBe(true); // OR-merged
    expect(seafarers?.hydrated).toBe(false); // awaits BGG hydration

    const base13 = await store.getByBggId(13);
    const exps = await store.getExpansionsForBase(base13!.id);
    expect(exps.map((e) => e.bggId).sort((a, b) => a - b)).toEqual([926, 927]);

    // 999 stayed a base game, never converted to an expansion of 555.
    expect((await store.getByBggId(999))?.type).toBe('base');
  });
});
