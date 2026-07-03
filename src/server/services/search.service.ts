import type { GameStore } from './game-store.js';
import type { BggPort, BggThing } from '../../core/bgg/index.js';
import type { BggSearchResultDto } from '../../shared/schemas/index.js';

const ID_QUERY = /^\d{5,}$/;
const HYDRATE_LIMIT = 20;

/**
 * Backs GET /api/bgg/search (§6). A 5+ digit query is an add-by-id lookup
 * (getThings, both types — the only way to add an expansion directly). Otherwise a
 * name search, ordered year-desc, with the top results batch-hydrated in ONE
 * getThings call so rows are rich (kills the old N+1 — ledger D).
 */
export class SearchService {
  constructor(
    private readonly bgg: BggPort,
    private readonly store: GameStore,
  ) {}

  async search(query: string): Promise<BggSearchResultDto[]> {
    const q = query.trim();
    if (ID_QUERY.test(q)) {
      const { things } = await this.bgg.getThings([parseInt(q, 10)]);
      return this.toDtos(things);
    }

    const results = await this.bgg.search(q);
    const ordered = [...results].sort((a, b) => (b.yearPublished ?? 0) - (a.yearPublished ?? 0));
    const top = ordered.slice(0, HYDRATE_LIMIT);
    const { things } = await this.bgg.getThings(top.map((r) => r.bggId));
    const byId = new Map(things.map((t) => [t.bggId, t]));

    const dtos: BggSearchResultDto[] = [];
    for (const res of top) {
      const thing = byId.get(res.bggId);
      if (thing) dtos.push(await this.toDto(thing));
    }
    return dtos;
  }

  private async toDtos(things: BggThing[]): Promise<BggSearchResultDto[]> {
    const dtos: BggSearchResultDto[] = [];
    for (const thing of things) dtos.push(await this.toDto(thing));
    return dtos;
  }

  private async toDto(thing: BggThing): Promise<BggSearchResultDto> {
    const existing = await this.store.getByBggId(thing.bggId);
    return {
      bggId: thing.bggId,
      name: thing.name,
      yearPublished: thing.yearPublished,
      image: thing.image,
      ratingAvg: thing.ratingAvg,
      publishers: thing.publishers,
      minPlayers: thing.minPlayers,
      maxPlayers: thing.maxPlayers,
      playtime: thing.playtime,
      families: thing.families,
      type: thing.type,
      inLibrary: Boolean(existing),
    };
  }
}
