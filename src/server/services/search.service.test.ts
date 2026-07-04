import { describe, it, expect, vi } from 'vitest';
import { SearchService } from './search.service.js';
import { makeFakeBgg, makeThing } from '../test-support/fakes.js';
import type { GameStore } from './game-store.js';
import type { BggSearchResult, BggThing } from '../../core/bgg/index.js';
import type { GameRow } from '../../db/schema.js';

const emptyStore = { getByBggId: async () => undefined } as unknown as GameStore;

describe('SearchService.search', () => {
  it('treats a 5+ digit query as add-by-id (getThings, no name search)', async () => {
    const bgg = makeFakeBgg({ things: { 17226: makeThing({ bggId: 17226, type: 'expansion' }) } });
    const searchSpy = vi.spyOn(bgg, 'search');

    const dtos = await new SearchService(bgg, emptyStore).search('17226');

    expect(bgg.getThingsCalls).toEqual([[17226]]);
    expect(searchSpy).not.toHaveBeenCalled();
    expect(dtos).toHaveLength(1);
    expect(dtos[0]).toMatchObject({ bggId: 17226, type: 'expansion' });
  });

  it('orders name results year-desc, hydrates the top 20 in ONE batch, and caps at 20', async () => {
    const results: BggSearchResult[] = [];
    const things: Record<number, BggThing> = {};
    for (let i = 1; i <= 25; i++) {
      const year = 2000 + ((i * 7) % 25); // 7 is coprime with 25 -> 25 distinct years 2000..2024
      results.push({ bggId: i, name: `G${i}`, yearPublished: year, type: 'base' });
      things[i] = makeThing({ bggId: i, yearPublished: year });
    }
    const bgg = makeFakeBgg({ searchResults: results, things });

    const dtos = await new SearchService(bgg, emptyStore).search('catan');
    const years = dtos.map((d) => d.yearPublished);

    expect(dtos).toHaveLength(20); // HYDRATE_LIMIT
    expect(bgg.getThingsCalls).toHaveLength(1); // single batch — no N+1
    expect(years).toEqual([...years].sort((a, b) => (b ?? 0) - (a ?? 0))); // year-desc
    expect(Math.min(...years.map((y) => y ?? 0))).toBe(2005); // the top 20 of 2000..2024
  });

  it('flags inLibrary from the store', async () => {
    const store = {
      getByBggId: async (id: number) => (id === 5 ? ({ id: 1 } as GameRow) : undefined),
    } as unknown as GameStore;
    const bgg = makeFakeBgg({
      searchResults: [
        { bggId: 5, name: 'Owned', yearPublished: 2010, type: 'base' },
        { bggId: 6, name: 'NotOwned', yearPublished: 2011, type: 'base' },
      ],
      things: { 5: makeThing({ bggId: 5 }), 6: makeThing({ bggId: 6 }) },
    });

    const dtos = await new SearchService(bgg, store).search('x');
    expect(dtos.find((d) => d.bggId === 5)?.inLibrary).toBe(true);
    expect(dtos.find((d) => d.bggId === 6)?.inLibrary).toBe(false);
  });
});
