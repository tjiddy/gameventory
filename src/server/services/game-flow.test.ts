import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../test-support/db.js';
import { makeThing, makeFakeBgg, silentLogger } from '../test-support/fakes.js';
import { GameStore } from './game-store.js';
import { GameService } from './game.service.js';
import { RefreshService } from './refresh.service.js';

interface Harness {
  store: GameStore;
  games: GameService;
  awaitHydration: () => Promise<void>;
}

async function harness(things: Record<number, ReturnType<typeof makeThing>>, tagline = 'A tagline'): Promise<Harness> {
  const db = await makeTestDb();
  const store = new GameStore(db);
  const bgg = makeFakeBgg({ things, tagline });
  const refresh = new RefreshService(store, bgg, silentLogger);
  let hydration: Promise<void> = Promise.resolve();
  const games = new GameService(store, bgg, silentLogger, {
    onStubsCreated: (ids) => {
      hydration = refresh.hydrateStubs(ids);
    },
  });
  return { store, games, awaitHydration: () => hydration };
}

describe('add flow (§5/§6)', () => {
  it('adds a base game, writes tagline, creates stubs+junctions, and hydrates them', async () => {
    const { store, games, awaitHydration } = await harness({
      13: makeThing({
        bggId: 13,
        name: 'Catan',
        type: 'base',
        expansionLinks: [
          { bggId: 927, name: 'Catan: Cities & Knights' },
          { bggId: 926, name: 'Catan: Seafarers' },
        ],
      }),
      926: makeThing({ bggId: 926, name: 'Catan: Seafarers', type: 'expansion', yearPublished: 1997 }),
      927: makeThing({ bggId: 927, name: 'Catan: Cities & Knights', type: 'expansion', yearPublished: 1998 }),
    });

    const detail = await games.addGame(13);
    await awaitHydration();

    expect(detail.type).toBe('base');
    expect(detail.owned).toBe(true);
    expect(detail.played).toBe(false);
    expect(detail.tagline).toBe('A tagline');
    // Expansions ordered by yearPublished asc (Seafarers 1997 before C&K 1998).
    expect(detail.expansions.map((e) => e.bggId)).toEqual([926, 927]);

    // Stubs are owned=false but hydrate to hydrated=true.
    const seafarers = await store.getByBggId(926);
    expect(seafarers?.type).toBe('expansion');
    expect(seafarers?.owned).toBe(false);
    expect(seafarers?.hydrated).toBe(true);
    // Not in the base library.
    const base = await store.listBase();
    expect(base.map((g) => g.bggId)).toEqual([13]);
  });

  it('adding an existing expansion stub marks it owned, keeping type=expansion', async () => {
    const { store, games, awaitHydration } = await harness({
      13: makeThing({ bggId: 13, type: 'base', expansionLinks: [{ bggId: 926, name: 'Seafarers' }] }),
      926: makeThing({ bggId: 926, type: 'expansion' }),
    });
    await games.addGame(13);
    await awaitHydration();
    expect((await store.getByBggId(926))?.owned).toBe(false);

    await games.addGame(926); // user explicitly owns the expansion now
    const exp = await store.getByBggId(926);
    expect(exp?.owned).toBe(true);
    expect(exp?.type).toBe('expansion');
  });

  it('conflicts (409) when adding a base already in the library', async () => {
    const { games } = await harness({ 13: makeThing({ bggId: 13, type: 'base' }) });
    await games.addGame(13);
    await expect(games.addGame(13)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('404s when BGG does not know the id', async () => {
    const { games } = await harness({});
    await expect(games.addGame(99999)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deleting a base removes its orphaned (unowned) expansions', async () => {
    const { store, games, awaitHydration } = await harness({
      13: makeThing({ bggId: 13, type: 'base', expansionLinks: [{ bggId: 926, name: 'Seafarers' }] }),
      926: makeThing({ bggId: 926, type: 'expansion' }),
    });
    await games.addGame(13);
    await awaitHydration();
    await games.deleteGame(13);
    expect(await store.getByBggId(13)).toBeUndefined();
    expect(await store.getByBggId(926)).toBeUndefined(); // orphan cleaned up
  });

  it('refuses (409) to delete an expansion directly', async () => {
    const { games, awaitHydration } = await harness({
      13: makeThing({ bggId: 13, type: 'base', expansionLinks: [{ bggId: 926, name: 'Seafarers' }] }),
      926: makeThing({ bggId: 926, type: 'expansion' }),
    });
    await games.addGame(13);
    await awaitHydration();
    await expect(games.deleteGame(926)).rejects.toMatchObject({ statusCode: 409 });
  });
});
