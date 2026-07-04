import { describe, it, expect } from 'vitest';
import { rowToSummary, rowToExpansionSummary, rowToDetail } from './mappers.js';
import type { GameRow } from '../../db/schema.js';

const createTime = new Date('2024-01-02T03:04:05.000Z');
const updateTime = new Date('2024-02-03T04:05:06.000Z');

// A row whose every nullable metadata column is null — the shape a migrated,
// unhydrated base has (seedFromPlan writes null arrays, not []). This is the ONE
// prod path that exercises arr()'s null->[] coalescing; if it regressed the Zod
// response serializer would reject the row and 500 the whole GET /api/games list.
const nullRow: GameRow = {
  id: 1, bggId: 13, type: 'base', hydrated: false,
  owned: true, played: false, createTime,
  name: 'Catan', description: null, tagline: null, bggUrl: null,
  thumbnail: null, image: null, yearPublished: null,
  minPlayers: null, maxPlayers: null, playtime: null, minPlaytime: null, maxPlaytime: null,
  ratingAvg: null, ratingBavg: null, ratingStdev: null, ratingVotes: null,
  weightAvg: null, weightVotes: null, rank: null,
  isCooperative: false, isLegacy: false, isCampaign: false, is18xx: false,
  designers: null, publishers: null, artists: null, families: null, categories: null, mechanics: null,
  updateTime,
};

// Distinct sentinel per field so a field-to-field transposition is caught.
const fullRow: GameRow = {
  id: 2, bggId: 174430, type: 'base', hydrated: true,
  owned: true, played: true, createTime,
  name: 'Gloomhaven', description: 'desc', tagline: 'Vanquish monsters', bggUrl: 'https://bgg/174430',
  thumbnail: 'thumb.jpg', image: 'image.jpg', yearPublished: 2017,
  minPlayers: 1, maxPlayers: 4, playtime: 120, minPlaytime: 60, maxPlaytime: 150,
  ratingAvg: 8.7, ratingBavg: 8.5, ratingStdev: 1.6, ratingVotes: 52000,
  weightAvg: 3.9, weightVotes: 7000, rank: 1,
  isCooperative: true, isLegacy: false, isCampaign: true, is18xx: false,
  designers: ['Isaac Childres'], publishers: ['Cephalofair'], artists: ['Alexandr Elichev'],
  families: ['Legacy'], categories: ['Adventure'], mechanics: ['Hand Management'],
  updateTime,
};

describe('rowToSummary', () => {
  it('coalesces every null metadata array to [] (migrated unhydrated base must not 500 the list)', () => {
    const s = rowToSummary(nullRow);
    for (const key of ['designers', 'publishers', 'artists', 'families', 'categories', 'mechanics'] as const) {
      expect(s[key]).toEqual([]);
    }
  });

  it('maps Date columns to epoch millis', () => {
    const s = rowToSummary(nullRow);
    expect(s.createTime).toBe(createTime.getTime());
    expect(s.updateTime).toBe(updateTime.getTime());
  });

  it('maps each field to its own column — no transposition', () => {
    expect(rowToSummary(fullRow)).toEqual({
      bggId: 174430, name: 'Gloomhaven', image: 'image.jpg', tagline: 'Vanquish monsters',
      yearPublished: 2017, minPlayers: 1, maxPlayers: 4, playtime: 120,
      ratingAvg: 8.7, ratingBavg: 8.5, ratingVotes: 52000, weightAvg: 3.9,
      isCooperative: true, isLegacy: false, isCampaign: true, is18xx: false,
      designers: ['Isaac Childres'], publishers: ['Cephalofair'], artists: ['Alexandr Elichev'],
      families: ['Legacy'], categories: ['Adventure'], mechanics: ['Hand Management'],
      owned: true, played: true,
      createTime: createTime.getTime(), updateTime: updateTime.getTime(),
    });
  });
});

describe('rowToDetail', () => {
  it('extends the summary with detail-only fields and the given expansions', () => {
    const d = rowToDetail(fullRow, []);
    expect(d.name).toBe('Gloomhaven'); // inherits the summary mapping
    expect(d.description).toBe('desc');
    expect(d.bggUrl).toBe('https://bgg/174430');
    expect(d.thumbnail).toBe('thumb.jpg');
    expect(d.ratingStdev).toBe(1.6);
    expect(d.weightVotes).toBe(7000);
    expect(d.rank).toBe(1);
    expect(d.minPlaytime).toBe(60);
    expect(d.maxPlaytime).toBe(150);
    expect(d.type).toBe('base');
    expect(d.hydrated).toBe(true);
    expect(d.expansions).toEqual([]);
  });
});

describe('rowToExpansionSummary', () => {
  it('projects the expansion fields and passes null metadata through unchanged', () => {
    expect(rowToExpansionSummary({ ...nullRow, type: 'expansion', owned: false })).toEqual({
      bggId: 13, name: 'Catan', yearPublished: null, image: null, description: null,
      ratingAvg: null, weightAvg: null, owned: false, played: false, hydrated: false,
    });
  });
});
