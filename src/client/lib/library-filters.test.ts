import { describe, it, expect } from 'vitest';
import type { GameSummary } from '../../shared/schemas/index.js';
import {
  filterAndSort,
  parseFiltersFromParams,
  filtersToParams,
  defaultDirection,
  DEFAULT_FILTERS,
  type LibraryFilters,
} from './library-filters.js';

function makeGame(o: Partial<GameSummary> & { bggId: number; name: string }): GameSummary {
  return {
    image: null, tagline: null, yearPublished: 2000, minPlayers: 2, maxPlayers: 4, playtime: 60,
    ratingAvg: 5, ratingBavg: 5, ratingVotes: 100, weightAvg: 2,
    isCooperative: false, isLegacy: false, isCampaign: false, is18xx: false,
    designers: [], publishers: [], artists: [], families: [], categories: [], mechanics: [],
    owned: true, played: false, createTime: 1000, updateTime: 1000,
    ...o,
  };
}

const withFilters = (over: Partial<LibraryFilters>): LibraryFilters => ({ ...DEFAULT_FILTERS, ...over });

const A = makeGame({ bggId: 1, name: 'Alpha', ratingAvg: 8, yearPublished: 2015, weightAvg: 3.5, createTime: 300, minPlayers: 1, maxPlayers: 4 });
const B = makeGame({ bggId: 2, name: 'Bravo', ratingAvg: 6, yearPublished: 1999, weightAvg: 1.2, createTime: 100, minPlayers: 3, maxPlayers: 8 });
const C = makeGame({ bggId: 3, name: 'Charlie', ratingAvg: 7, yearPublished: 2020, weightAvg: 2.0, createTime: 200, minPlayers: 2, maxPlayers: 2 });
const ALL = [A, B, C];

describe('sorting', () => {
  it('defaults numeric sorts to highest-first and Name to A→Z', () => {
    expect(defaultDirection('rating_avg')).toBe('desc');
    expect(defaultDirection('name')).toBe('asc');
  });

  it('sorts by Average Rating desc by default', () => {
    const out = filterAndSort(ALL, DEFAULT_FILTERS).map((g) => g.name);
    expect(out).toEqual(['Alpha', 'Charlie', 'Bravo']); // 8, 7, 6
  });

  it('toggles direction (rating asc)', () => {
    const out = filterAndSort(ALL, withFilters({ sortDirection: 'asc' })).map((g) => g.name);
    expect(out).toEqual(['Bravo', 'Charlie', 'Alpha']);
  });

  it('sorts by Name A→Z and Z→A', () => {
    expect(filterAndSort(ALL, withFilters({ sortBy: 'name', sortDirection: 'asc' })).map((g) => g.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(filterAndSort(ALL, withFilters({ sortBy: 'name', sortDirection: 'desc' })).map((g) => g.name)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by Published, Weight, and Date Added', () => {
    expect(filterAndSort(ALL, withFilters({ sortBy: 'year_published' })).map((g) => g.name)).toEqual(['Charlie', 'Alpha', 'Bravo']);
    expect(filterAndSort(ALL, withFilters({ sortBy: 'weight_avg' })).map((g) => g.name)).toEqual(['Alpha', 'Charlie', 'Bravo']);
    expect(filterAndSort(ALL, withFilters({ sortBy: 'create_time', sortDirection: 'asc' })).map((g) => g.name)).toEqual(['Bravo', 'Charlie', 'Alpha']);
  });

  it('sinks null numeric values to the bottom when sorting desc', () => {
    const nullRating = makeGame({ bggId: 9, name: 'Zeta', ratingAvg: null });
    const out = filterAndSort([...ALL, nullRating], withFilters({ sortBy: 'rating_avg' })).map((g) => g.name);
    expect(out[out.length - 1]).toBe('Zeta');
  });
});

describe('filtering', () => {
  it('filters by player count including the 7+ bucket', () => {
    expect(filterAndSort(ALL, withFilters({ playerCount: '7+' })).map((g) => g.name)).toEqual(['Bravo']); // maxPlayers 8
    expect(filterAndSort(ALL, withFilters({ playerCount: '1' })).map((g) => g.name)).toEqual(['Alpha']); // min 1
    expect(filterAndSort(ALL, withFilters({ playerCount: '2' })).map((g) => g.name).sort()).toEqual(['Alpha', 'Charlie']);
  });

  it('filters by played state', () => {
    const played = makeGame({ bggId: 5, name: 'Delta', played: true });
    const games = [A, played];
    expect(filterAndSort(games, withFilters({ playedFilter: 'played' })).map((g) => g.name)).toEqual(['Delta']);
    expect(filterAndSort(games, withFilters({ playedFilter: 'not_played' })).map((g) => g.name)).toEqual(['Alpha']);
  });

  it('filters by game type flag', () => {
    const coop = makeGame({ bggId: 6, name: 'Echo', isCooperative: true });
    expect(filterAndSort([A, coop], withFilters({ gameType: 'cooperative' })).map((g) => g.name)).toEqual(['Echo']);
  });

  it('filters by case-insensitive name substring', () => {
    expect(filterAndSort(ALL, withFilters({ text: 'RAV' })).map((g) => g.name)).toEqual(['Bravo']);
  });

  it('ANDs multiple tags; Attribute tags map to flags, others to metadata arrays', () => {
    const g = makeGame({ bggId: 7, name: 'Foxtrot', isCampaign: true, mechanics: ['Deck Building'], designers: ['Uwe'] });
    const other = makeGame({ bggId: 8, name: 'Golf', isCampaign: true, mechanics: ['Deck Building'] });
    const games = [g, other];
    const filters = withFilters({
      tags: [
        { type: 'Attribute', name: 'Campaign' },
        { type: 'Mechanic', name: 'Deck Building' },
        { type: 'Designer', name: 'Uwe' },
      ],
    });
    expect(filterAndSort(games, filters).map((x) => x.name)).toEqual(['Foxtrot']); // only Foxtrot has all three
  });
});

describe('URL params (5 frozen names)', () => {
  it('parses known params and ignores junk', () => {
    const parsed = parseFiltersFromParams(new URLSearchParams('gameType=legacy&playerCount=7%2B&sortBy=name&sortDirection=asc&playedFilter=played&bogus=x'));
    expect(parsed).toEqual({
      gameType: 'legacy', playerCount: '7+', sortBy: 'name', sortDirection: 'asc', playedFilter: 'played',
    });
  });

  it('drops invalid values', () => {
    const parsed = parseFiltersFromParams(new URLSearchParams('gameType=nonsense&sortBy=alsobad'));
    expect(parsed.gameType).toBeUndefined();
    expect(parsed.sortBy).toBeUndefined();
  });

  it('round-trips non-default filters back to params', () => {
    const params = filtersToParams(withFilters({ gameType: 'campaign', playerCount: '7+', sortBy: 'weight_avg', sortDirection: 'asc' }));
    expect(params.get('gameType')).toBe('campaign');
    expect(params.get('playerCount')).toBe('7+');
    expect(params.get('sortBy')).toBe('weight_avg');
    expect(params.get('sortDirection')).toBe('asc');
    expect(params.get('playedFilter')).toBeNull(); // default omitted
  });
});
