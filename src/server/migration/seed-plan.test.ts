import { describe, it, expect } from 'vitest';
import { coerceDocs, buildSeedPlan } from './mongo-import.js';

const NOW = new Date('2024-01-01T00:00:00.000Z');

// buildSeedPlan is pure (docs -> plan). The migration exists to preserve user state,
// so these defaults are load-bearing: flip `?? true` to `?? false` and the whole
// library imports as not-owned — mongo-import.test.ts asserts scan/merge but not these.
describe('buildSeedPlan — user-state defaults', () => {
  it('defaults a base missing owned/played to owned=true, played=false', () => {
    const docs = coerceDocs([{ bgg_id: 555, name: 'Kept', tagline: null, create_time: null, expansions: [] }]);
    expect(buildSeedPlan(docs, NOW).bases[0]).toMatchObject({ bggId: 555, owned: true, played: false });
  });

  it('does NOT coerce an explicit owned=false to true', () => {
    const docs = coerceDocs([{ bgg_id: 99, name: 'Unowned', owned: false, tagline: null, create_time: null, expansions: [] }]);
    expect(buildSeedPlan(docs, NOW).bases[0]!.owned).toBe(false);
  });

  it('carries tagline through, and yields null when absent', () => {
    const docs = coerceDocs([
      { bgg_id: 13, name: 'A', tagline: 'Trade & build', create_time: null, expansions: [] },
      { bgg_id: 14, name: 'B', tagline: null, create_time: null, expansions: [] },
    ]);
    const { bases } = buildSeedPlan(docs, NOW);
    expect(bases.find((b) => b.bggId === 13)?.tagline).toBe('Trade & build');
    expect(bases.find((b) => b.bggId === 14)?.tagline).toBeNull();
  });
});
