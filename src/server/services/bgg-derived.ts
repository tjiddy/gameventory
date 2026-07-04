import type { BggThing } from '../../core/bgg/index.js';

/**
 * The EXACT set of columns the refresh/hydration pipeline may write (§5 enumeration
 * + §0.3). `tagline` is BGG-derived but excluded here — it is written
 * only at add-time and single-game refresh, never by the cron. `type`, `owned`,
 * `played`, `createTime`, and `bggId` are NEVER in this set. The §12.1 write-set
 * test asserts buildBggDerivedUpdate produces exactly these keys.
 */
export const BGG_DERIVED_COLUMNS = [
  'name', 'description', 'bggUrl', 'thumbnail', 'image', 'yearPublished', 'minPlayers',
  'maxPlayers', 'playtime', 'minPlaytime', 'maxPlaytime', 'ratingAvg', 'ratingBavg',
  'ratingStdev', 'ratingVotes', 'weightAvg', 'weightVotes', 'rank', 'isCooperative',
  'isLegacy', 'isCampaign', 'is18xx', 'designers', 'publishers', 'artists', 'families',
  'categories', 'mechanics', 'updateTime', 'hydrated',
] as const;

export interface BggDerivedUpdate {
  name: string;
  description: string | null;
  bggUrl: string | null;
  thumbnail: string | null;
  image: string | null;
  yearPublished: number | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playtime: number | null;
  minPlaytime: number | null;
  maxPlaytime: number | null;
  ratingAvg: number | null;
  ratingBavg: number | null;
  ratingStdev: number | null;
  ratingVotes: number | null;
  weightAvg: number | null;
  weightVotes: number | null;
  rank: number | null;
  isCooperative: boolean;
  isLegacy: boolean;
  isCampaign: boolean;
  is18xx: boolean;
  designers: string[];
  publishers: string[];
  artists: string[];
  families: string[];
  categories: string[];
  mechanics: string[];
  updateTime: Date;
  hydrated: boolean;
}

/**
 * Build the BGG-derived column update for a mapped thing. This is the ONE place
 * refresh/hydration writes metadata — it structurally cannot touch user state or
 * `type` because those keys are not in the returned object.
 */
export function buildBggDerivedUpdate(thing: BggThing, now: Date): BggDerivedUpdate {
  return {
    name: thing.name,
    description: thing.description,
    bggUrl: thing.bggUrl,
    thumbnail: thing.thumbnail,
    image: thing.image,
    yearPublished: thing.yearPublished,
    minPlayers: thing.minPlayers,
    maxPlayers: thing.maxPlayers,
    playtime: thing.playtime,
    minPlaytime: thing.minPlaytime,
    maxPlaytime: thing.maxPlaytime,
    ratingAvg: thing.ratingAvg,
    ratingBavg: thing.ratingBavg,
    ratingStdev: thing.ratingStdev,
    ratingVotes: thing.ratingVotes,
    weightAvg: thing.weightAvg,
    weightVotes: thing.weightVotes,
    rank: thing.rank,
    isCooperative: thing.isCooperative,
    isLegacy: thing.isLegacy,
    isCampaign: thing.isCampaign,
    is18xx: thing.is18xx,
    designers: thing.designers,
    publishers: thing.publishers,
    artists: thing.artists,
    families: thing.families,
    categories: thing.categories,
    mechanics: thing.mechanics,
    updateTime: now,
    hydrated: true,
  };
}
