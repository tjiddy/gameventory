import { describe, it, expect } from 'vitest';
import { makeTestDb } from '../test-support/db.js';
import { makeFakeBgg, silentLogger } from '../test-support/fakes.js';
import { buildTestApp } from '../test-support/app.js';
import { createServices } from '../services/di.js';
import { requiresAdmin } from '../plugins/auth.js';

describe('requiresAdmin policy predicate (§9)', () => {
  it('guards every non-GET /api and GET /api/bgg/search; leaves other GETs public', () => {
    expect(requiresAdmin('POST', '/api/games')).toBe(true);
    expect(requiresAdmin('PATCH', '/api/games/13')).toBe(true);
    expect(requiresAdmin('DELETE', '/api/games/13')).toBe(true);
    expect(requiresAdmin('POST', '/api/refresh')).toBe(true);
    expect(requiresAdmin('GET', '/api/bgg/search')).toBe(true);
    // Every /api/admin/* route is admin-only — GET included (the admin branch
    // precedes the public-GET branch).
    expect(requiresAdmin('GET', '/api/admin/backups')).toBe(true);
    expect(requiresAdmin('POST', '/api/admin/backups')).toBe(true);
    expect(requiresAdmin('DELETE', '/api/admin/backups/gameventory-backup-x.json')).toBe(true);
    expect(requiresAdmin('GET', '/api/games')).toBe(false);
    expect(requiresAdmin('GET', '/api/games/13')).toBe(false);
    expect(requiresAdmin('GET', '/api/health')).toBe(false);
    expect(requiresAdmin('GET', '/api/refresh/status')).toBe(false);
    expect(requiresAdmin('GET', '/')).toBe(false); // SPA
    expect(requiresAdmin('POST', '/login')).toBe(false); // non-/api
  });
});

describe('default-deny auth hook against real routes (§12.2)', () => {
  it('anonymous requests are 401 on mutations + guarded search, public elsewhere', async () => {
    const db = await makeTestDb();
    const services = createServices(db, silentLogger, makeFakeBgg());
    const app = await buildTestApp(services, db); // isAdmin defaults to anonymous
    try {
      const denied = [
        { method: 'POST' as const, url: '/api/games', payload: { bggId: 13 } },
        { method: 'PATCH' as const, url: '/api/games/13', payload: { played: true } },
        { method: 'DELETE' as const, url: '/api/games/13' },
        { method: 'POST' as const, url: '/api/games/13/refresh' },
        { method: 'POST' as const, url: '/api/refresh' },
        { method: 'GET' as const, url: '/api/bgg/search?q=catan' },
        { method: 'GET' as const, url: '/api/admin/backups' },
        { method: 'POST' as const, url: '/api/admin/backups' },
        { method: 'DELETE' as const, url: '/api/admin/backups/gameventory-backup-x.json' },
      ];
      for (const req of denied) {
        const res = await app.inject(req);
        expect(res.statusCode, `${req.method} ${req.url}`).toBe(401);
      }

      const publicOk: { url: string; expect: number }[] = [
        { url: '/api/health', expect: 200 },
        { url: '/api/games', expect: 200 },
        { url: '/api/refresh/status', expect: 200 },
        { url: '/api/auth/me', expect: 200 },
        { url: '/api/games/13', expect: 404 }, // public, just not present
      ];
      for (const { url, expect: code } of publicOk) {
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode, url).toBe(code);
      }
    } finally {
      await app.close();
    }
  });
});
