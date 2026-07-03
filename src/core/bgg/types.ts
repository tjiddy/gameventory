export type BggThingType = 'base' | 'expansion';

/** A base↔expansion link as reported by BGG — reference only, never fetched inline. */
export interface BggExpansionLink {
  bggId: number;
  name: string;
}

/**
 * A fully-mapped BGG "thing" (base game or expansion). These are the BGG-derived
 * fields only — user state (owned/played) and the tagline scrape live elsewhere.
 * Every scalar is `T | null` (BGG omits fields freely); arrays default to empty.
 */
export interface BggThing {
  bggId: number;
  type: BggThingType;
  name: string;
  description: string | null;
  thumbnail: string | null;
  image: string | null;
  bggUrl: string;
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
  expansionLinks: BggExpansionLink[];
}

/** A BGG name-search hit (bare — the rich fields come from a follow-up getThings). */
export interface BggSearchResult {
  bggId: number;
  name: string;
  yearPublished: number | null;
  type: BggThingType;
}

/**
 * The port services depend on (dependency inversion) — BggAdapter implements it,
 * and tests inject a lightweight fake without HTTP mocking.
 */
export interface BggPort {
  search(query: string): Promise<BggSearchResult[]>;
  getThings(bggIds: number[]): Promise<BggThingsResult>;
  scrapeTagline(bggId: number): Promise<string | null>;
}

/**
 * Result of a batched getThings call. `missing` holds requested ids that BGG did
 * not return (dead ids, or a chunk-mate that failed to map) — per-id failures,
 * never a batch failure (MIGRATION-PLAN §7.3).
 */
export interface BggThingsResult {
  things: BggThing[];
  missing: number[];
}
