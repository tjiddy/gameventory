import { describe, it, expect } from 'vitest';
import { buildCardTags } from './card-tags';
import type { GameSummary } from '../../shared/schemas/index.js';

function game(over: Partial<GameSummary>): GameSummary {
  return {
    bggId: 1, name: 'G', image: null, tagline: null, yearPublished: null,
    minPlayers: null, maxPlayers: null, playtime: null,
    ratingAvg: null, ratingBavg: null, ratingVotes: null, weightAvg: null,
    isCooperative: false, isLegacy: false, isCampaign: false, is18xx: false,
    designers: [], publishers: [], artists: [], families: [], categories: [], mechanics: [],
    owned: true, played: false, createTime: 0, updateTime: 0,
    ...over,
  };
}

describe('buildCardTags', () => {
  it('adds the first publisher, first designer, and every mechanic', () => {
    expect(buildCardTags(game({ publishers: ['Pub1', 'Pub2'], designers: ['Des1'], mechanics: ['M1', 'M2'] }))).toEqual([
      { label: 'Pub1', tag: { type: 'Publisher', name: 'Pub1' } },
      { label: 'Des1', tag: { type: 'Designer', name: 'Des1' } },
      { label: 'M1', tag: { type: 'Mechanic', name: 'M1' } },
      { label: 'M2', tag: { type: 'Mechanic', name: 'M2' } },
    ]);
  });

  it('strips the "Mechanism: " prefix for the label but filters on the FULL family string', () => {
    // The bug this guards: a mechanism tag whose click-filter uses the stripped
    // label would match nothing (the library filters on the full family string).
    expect(buildCardTags(game({ families: ['Mechanism: Deck Building', 'Theme: Space'] }))).toEqual([
      { label: 'Deck Building', tag: { type: 'Family', name: 'Mechanism: Deck Building' } },
    ]);
  });
});
