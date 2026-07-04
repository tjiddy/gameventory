import { describe, it, expect } from 'vitest';
import { buildBggDerivedUpdate } from './bgg-derived.js';
import { makeThing } from '../test-support/fakes.js';

// refresh-writeset.test.ts already pins the KEY set (§0.3 — no user-state/type/bggId).
// This pins the VALUE mapping: each BGG-derived field copied to its matching column,
// which a same-typed field swap (TS can't catch) would otherwise ship silently.
describe('buildBggDerivedUpdate — field-for-field value mapping', () => {
  it('copies each field to its own column and stamps updateTime + hydrated', () => {
    const now = new Date('2024-05-06T07:08:09.000Z');
    const thing = makeThing({
      bggId: 13,
      name: 'N', description: 'D', bggUrl: 'U', thumbnail: 'T', image: 'I',
      yearPublished: 2001, minPlayers: 1, maxPlayers: 9, playtime: 111, minPlaytime: 22, maxPlaytime: 222,
      ratingAvg: 7.7, ratingBavg: 6.6, ratingStdev: 1.1, ratingVotes: 333,
      weightAvg: 3.3, weightVotes: 44, rank: 55,
      isCooperative: true, isLegacy: true, isCampaign: true, is18xx: true,
      designers: ['ds'], publishers: ['pub'], artists: ['art'], families: ['fam'], categories: ['cat'], mechanics: ['mech'],
    });

    // toEqual is exhaustive, so it also re-pins the exact key set (no extra keys leak).
    expect(buildBggDerivedUpdate(thing, now)).toEqual({
      name: 'N', description: 'D', bggUrl: 'U', thumbnail: 'T', image: 'I',
      yearPublished: 2001, minPlayers: 1, maxPlayers: 9, playtime: 111, minPlaytime: 22, maxPlaytime: 222,
      ratingAvg: 7.7, ratingBavg: 6.6, ratingStdev: 1.1, ratingVotes: 333,
      weightAvg: 3.3, weightVotes: 44, rank: 55,
      isCooperative: true, isLegacy: true, isCampaign: true, is18xx: true,
      designers: ['ds'], publishers: ['pub'], artists: ['art'], families: ['fam'], categories: ['cat'], mechanics: ['mech'],
      updateTime: now, hydrated: true,
    });
  });
});
