import { describe, it, expect, vi } from 'vitest';
import { makeTestDb } from '../test-support/db.js';
import { makeThing, makeFakeBgg, silentLogger, TEST_ADMIN } from '../test-support/fakes.js';
import { buildTestApp } from '../test-support/app.js';
import { createServices } from '../services/di.js';

describe('bgg search route (admin session)', () => {
  it('GET /api/bgg/search?q=catan → 200 with the hydrated DTO, forwarding q', async () => {
    const db = await makeTestDb();
    // The search hit and its hydrated thing must BOTH be seeded: the name-search
    // path only emits a DTO for a hit whose id is present in the getThings map
    // (search.service.ts). The DTO reflects the hydrated thing, not the search hit —
    // note the hit says yearPublished 1995 but the DTO carries the thing's value.
    const thing = makeThing({ bggId: 13, name: 'Catan' });
    const fake = makeFakeBgg({
      searchResults: [{ bggId: 13, name: 'Catan', yearPublished: 1995, type: 'base' }],
      things: { 13: thing },
    });
    const services = createServices(db, silentLogger, fake);
    // Spy before the app is built so the route's captured service reference is the spy.
    const searchSpy = vi.spyOn(services.search, 'search');
    const app = await buildTestApp(services, db, { user: TEST_ADMIN });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/bgg/search?q=catan' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([
        {
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
          inLibrary: false,
        },
      ]);
      // The fake ignores its query arg, so status/body alone can't prove forwarding.
      expect(searchSpy).toHaveBeenCalledWith('catan');
      // forward-then-hydrate: the top hit's id is the one batch-hydrated.
      expect(fake.getThingsCalls).toEqual([[13]]);
    } finally {
      await app.close();
    }
  });

  it('GET /api/bgg/search?q= (empty) → 400 VALIDATION, never reaching the service', async () => {
    const db = await makeTestDb();
    const fake = makeFakeBgg();
    const services = createServices(db, silentLogger, fake);
    const searchSpy = vi.spyOn(services.search, 'search');
    const app = await buildTestApp(services, db, { user: TEST_ADMIN });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/bgg/search?q=' });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION');
      expect(searchSpy).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
