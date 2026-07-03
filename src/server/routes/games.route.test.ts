import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../test-support/db.js';
import { makeThing, makeFakeBgg, silentLogger, TEST_ADMIN } from '../test-support/fakes.js';
import { buildTestApp } from '../test-support/app.js';
import { createServices } from '../services/di.js';

async function adminApp(things: Record<number, ReturnType<typeof makeThing>>) {
  const db = await makeTestDb();
  const services = createServices(db, silentLogger, makeFakeBgg({ things, tagline: 'tag' }));
  return buildTestApp(services, db, { user: TEST_ADMIN });
}

describe('games routes (admin session)', () => {
  it('POST → 201, GET list/detail, PATCH played, DELETE → 204', async () => {
    const app = await adminApp({ 13: makeThing({ bggId: 13, name: 'Catan', type: 'base' }) });
    try {
      const add = await app.inject({ method: 'POST', url: '/api/games', payload: { bggId: 13 } });
      expect(add.statusCode).toBe(201);
      expect(add.json().name).toBe('Catan');

      const list = await app.inject({ method: 'GET', url: '/api/games' });
      expect(list.json()).toHaveLength(1);

      const detail = await app.inject({ method: 'GET', url: '/api/games/13' });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().owned).toBe(true);

      const patch = await app.inject({ method: 'PATCH', url: '/api/games/13', payload: { played: true } });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().played).toBe(true);

      const del = await app.inject({ method: 'DELETE', url: '/api/games/13' });
      expect(del.statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: '/api/games/13' })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('rejects an invalid POST body with 400', async () => {
    const app = await adminApp({});
    try {
      const res = await app.inject({ method: 'POST', url: '/api/games', payload: { bggId: 'nope' } });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('409 when adding a game already in the library', async () => {
    const app = await adminApp({ 13: makeThing({ bggId: 13, type: 'base' }) });
    try {
      await app.inject({ method: 'POST', url: '/api/games', payload: { bggId: 13 } });
      const dup = await app.inject({ method: 'POST', url: '/api/games', payload: { bggId: 13 } });
      expect(dup.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });
});
