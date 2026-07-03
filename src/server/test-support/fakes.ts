import type { FastifyBaseLogger } from 'fastify';
import type { BggThing, BggPort, BggThingsResult, BggSearchResult } from '../../core/bgg/index.js';

const noop = (): void => {};

/** A no-op logger for services under test. */
export const silentLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  trace: noop,
  fatal: noop,
  child: () => silentLogger,
  level: 'silent',
} as unknown as FastifyBaseLogger;

/** Build a fully-populated BggThing with sensible defaults; override any field. */
export function makeThing(overrides: Partial<BggThing> & { bggId: number }): BggThing {
  return {
    type: 'base',
    name: `Game ${overrides.bggId}`,
    description: 'A description',
    thumbnail: `https://img/${overrides.bggId}-thumb.jpg`,
    image: `https://img/${overrides.bggId}.jpg`,
    bggUrl: `https://boardgamegeek.com/boardgame/${overrides.bggId}`,
    yearPublished: 2000,
    minPlayers: 2,
    maxPlayers: 4,
    playtime: 60,
    minPlaytime: 30,
    maxPlaytime: 90,
    ratingAvg: 7,
    ratingBavg: 6.5,
    ratingStdev: 1.2,
    ratingVotes: 100,
    weightAvg: 2.5,
    weightVotes: 50,
    rank: 500,
    isCooperative: false,
    isLegacy: false,
    isCampaign: false,
    is18xx: false,
    designers: [],
    publishers: [],
    artists: [],
    families: [],
    categories: [],
    mechanics: [],
    expansionLinks: [],
    ...overrides,
  };
}

export interface FakeBgg extends BggPort {
  taglineCalls: number[];
  getThingsCalls: number[][];
}

export interface FakeBggOptions {
  things?: Record<number, BggThing>;
  searchResults?: BggSearchResult[];
  tagline?: string | null;
}

/** A BggPort backed by a fixed id→thing map — no HTTP, records calls for assertions. */
export function makeFakeBgg(opts: FakeBggOptions = {}): FakeBgg {
  const things = opts.things ?? {};
  const taglineCalls: number[] = [];
  const getThingsCalls: number[][] = [];
  return {
    taglineCalls,
    getThingsCalls,
    async getThings(ids: number[]): Promise<BggThingsResult> {
      getThingsCalls.push([...ids]);
      const found: BggThing[] = [];
      const missing: number[] = [];
      for (const id of ids) {
        const t = things[id];
        if (t) found.push(t);
        else missing.push(id);
      }
      return { things: found, missing };
    },
    async search(): Promise<BggSearchResult[]> {
      return opts.searchResults ?? [];
    },
    async scrapeTagline(id: number): Promise<string | null> {
      taglineCalls.push(id);
      return opts.tagline ?? null;
    },
  };
}
