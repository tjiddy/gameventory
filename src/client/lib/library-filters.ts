import type { GameSummary } from '../../shared/schemas/index.js';

// The library's client-side filter + sort logic (§3.1). This is
// where feature parity lives; it is a pure module so §12 test 4 can pin every rule.

export const SORT_OPTIONS = [
  { key: 'rating_avg', label: 'Average Rating' },
  { key: 'rating_bavg', label: 'BGG Rating' },
  { key: 'name', label: 'Name' },
  { key: 'year_published', label: 'Published' },
  { key: 'weight_avg', label: 'Weight' },
  { key: 'playtime', label: 'Playtime' },
  { key: 'create_time', label: 'Date Added' },
  { key: 'update_time', label: 'Date Updated' },
  { key: 'rating_votes', label: 'Vote Count' },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]['key'];
export type SortDirection = 'asc' | 'desc';
export type GameType = 'all' | '18xx' | 'campaign' | 'cooperative' | 'legacy';
export type PlayerCount = 'all' | '1' | '2' | '3' | '4' | '5' | '6' | '7+';
export type PlayedFilter = 'all' | 'played' | 'not_played';

export interface TagFilter {
  type: string;
  name: string;
}

export interface LibraryFilters {
  gameType: GameType;
  playerCount: PlayerCount;
  playedFilter: PlayedFilter;
  sortBy: SortKey;
  sortDirection: SortDirection;
  text: string;
  tags: TagFilter[];
}

const NUMERIC_FIELD: Record<Exclude<SortKey, 'name'>, (g: GameSummary) => number | null> = {
  rating_avg: (g) => g.ratingAvg,
  rating_bavg: (g) => g.ratingBavg,
  year_published: (g) => g.yearPublished,
  weight_avg: (g) => g.weightAvg,
  playtime: (g) => g.playtime,
  create_time: (g) => g.createTime,
  update_time: (g) => g.updateTime,
  rating_votes: (g) => g.ratingVotes,
};

/** Numeric fields default highest-first; Name defaults A→Z (§3.1). */
export function defaultDirection(sortBy: SortKey): SortDirection {
  return sortBy === 'name' ? 'asc' : 'desc';
}

export const DEFAULT_FILTERS: LibraryFilters = {
  gameType: 'all',
  playerCount: 'all',
  playedFilter: 'all',
  sortBy: 'rating_avg',
  sortDirection: 'desc',
  text: '',
  tags: [],
};

function matchesPlayers(game: GameSummary, pc: PlayerCount): boolean {
  if (pc === 'all') return true;
  if (pc === '7+') return (game.maxPlayers ?? 0) >= 7;
  const n = Number(pc);
  return (game.minPlayers ?? 0) <= n && n <= (game.maxPlayers ?? 0);
}

function matchesType(game: GameSummary, type: GameType): boolean {
  switch (type) {
    case '18xx': return game.is18xx;
    case 'campaign': return game.isCampaign;
    case 'cooperative': return game.isCooperative;
    case 'legacy': return game.isLegacy;
    default: return true;
  }
}

function matchesPlayed(game: GameSummary, played: PlayedFilter): boolean {
  if (played === 'played') return game.played;
  if (played === 'not_played') return !game.played;
  return true;
}

/** Tag-click filter semantics (§3.2): Attribute tags map to a flag; anything else
    matches any of families/mechanics/categories/designers/publishers. */
export function matchesTag(game: GameSummary, tag: TagFilter): boolean {
  if (tag.type === 'Attribute') {
    switch (tag.name.toLowerCase()) {
      case 'campaign': return game.isCampaign;
      case 'legacy': return game.isLegacy;
      case 'cooperative': return game.isCooperative;
      case '18xx': return game.is18xx;
      default: return false;
    }
  }
  const has = (arr: string[]): boolean => arr.includes(tag.name);
  return (
    has(game.families) || has(game.mechanics) || has(game.categories) ||
    has(game.designers) || has(game.publishers)
  );
}

function matchesFilters(game: GameSummary, f: LibraryFilters): boolean {
  if (!matchesPlayed(game, f.playedFilter)) return false;
  if (!matchesType(game, f.gameType)) return false;
  if (!matchesPlayers(game, f.playerCount)) return false;
  if (f.text && !game.name.toLowerCase().includes(f.text.toLowerCase())) return false;
  return f.tags.every((tag) => matchesTag(game, tag)); // tags AND together
}

function compare(a: GameSummary, b: GameSummary, f: LibraryFilters): number {
  const dir = f.sortDirection === 'asc' ? 1 : -1;
  if (f.sortBy === 'name') return a.name.localeCompare(b.name) * dir;
  const field = NUMERIC_FIELD[f.sortBy];
  const av = field(a) ?? -Infinity;
  const bv = field(b) ?? -Infinity;
  if (av === bv) return a.name.localeCompare(b.name); // stable tiebreak by name
  return (av - bv) * dir;
}

/** Filter then sort. The card's 1-based "#index" is a game's position in this result. */
export function filterAndSort(games: GameSummary[], f: LibraryFilters): GameSummary[] {
  return games.filter((g) => matchesFilters(g, f)).sort((a, b) => compare(a, b, f));
}

// ---- URL param sync (only the 5 frozen names — §3.1) ----

const GAME_TYPES: GameType[] = ['all', '18xx', 'campaign', 'cooperative', 'legacy'];
const PLAYER_COUNTS: PlayerCount[] = ['all', '1', '2', '3', '4', '5', '6', '7+'];
const PLAYED: PlayedFilter[] = ['all', 'played', 'not_played'];

function oneOf<T extends string>(allowed: T[], value: string | null): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/** Parse the 5 frozen URL params into a partial filter (bookmarks must keep working). */
export function parseFiltersFromParams(params: URLSearchParams): Partial<LibraryFilters> {
  const out: Partial<LibraryFilters> = {};
  const gameType = oneOf(GAME_TYPES, params.get('gameType'));
  if (gameType) out.gameType = gameType;
  const playerCount = oneOf(PLAYER_COUNTS, params.get('playerCount'));
  if (playerCount) out.playerCount = playerCount;
  const playedFilter = oneOf(PLAYED, params.get('playedFilter'));
  if (playedFilter) out.playedFilter = playedFilter;
  const sortBy = SORT_OPTIONS.find((o) => o.key === params.get('sortBy'))?.key;
  if (sortBy) out.sortBy = sortBy;
  const sortDirection = oneOf(['asc', 'desc'] as SortDirection[], params.get('sortDirection'));
  if (sortDirection) out.sortDirection = sortDirection;
  return out;
}

/** Serialize the 5 frozen params (omitting values equal to the default). */
export function filtersToParams(f: LibraryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.gameType !== 'all') params.set('gameType', f.gameType);
  if (f.playerCount !== 'all') params.set('playerCount', f.playerCount);
  if (f.playedFilter !== 'all') params.set('playedFilter', f.playedFilter);
  params.set('sortBy', f.sortBy);
  params.set('sortDirection', f.sortDirection);
  return params;
}
