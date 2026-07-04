import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { FastifyInstance } from 'fastify';
import { makeTestDbFile } from '../test-support/db.js';
import { makeFakeBgg, silentLogger, TEST_ADMIN } from '../test-support/fakes.js';
import { buildTestApp } from '../test-support/app.js';
import { createServices } from '../services/di.js';
import { BackupService } from '../services/backup.service.js';
import { OperationLock } from '../services/operation-lock.js';
import type { NewGameRow } from '../../db/schema.js';

const tempDirs: string[] = [];
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) {
    const c = cleanups.pop();
    if (c) await c();
  }
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) await fs.rm(d, { recursive: true, force: true });
  }
});

function baseRow(bggId: number): NewGameRow {
  const now = new Date('2024-01-01T00:00:00.000Z');
  return { bggId, type: 'base', hydrated: true, owned: true, played: false, createTime: now, name: `G${bggId}`, updateTime: now };
}

interface Ctx {
  app: FastifyInstance;
  backupDir: string;
}

/** Build a test app whose backups service writes to a temp dir. */
async function adminCtx(opts: { anonymous?: boolean } = {}): Promise<Ctx> {
  const { db, cleanup } = await makeTestDbFile();
  cleanups.push(cleanup);
  const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-adminroute-'));
  tempDirs.push(backupDir);
  const services = createServices(db, silentLogger, makeFakeBgg());
  await services.store.insertGame(baseRow(13));
  // Point the backups service at the temp dir (createServices uses config.backupDir).
  (services as { backups: BackupService }).backups = new BackupService(
    db,
    services.store,
    silentLogger,
    { backupDir, retention: 20 },
    new OperationLock(),
  );
  const app = await buildTestApp(services, db, opts.anonymous ? {} : { user: TEST_ADMIN });
  return { app, backupDir };
}

describe('admin backup routes — auth', () => {
  it('401s anonymous requests to every /api/admin/backups verb', async () => {
    const { app } = await adminCtx({ anonymous: true });
    try {
      const reqs = [
        { method: 'GET' as const, url: '/api/admin/backups' },
        { method: 'POST' as const, url: '/api/admin/backups' },
        { method: 'GET' as const, url: '/api/admin/backups/gameventory-backup-x.json/download' },
        { method: 'DELETE' as const, url: '/api/admin/backups/gameventory-backup-x.json' },
      ];
      for (const r of reqs) {
        expect((await app.inject(r)).statusCode, `${r.method} ${r.url}`).toBe(401);
      }
    } finally {
      await app.close();
    }
  });
});

describe('admin backup routes — lifecycle (admin session)', () => {
  it('create → list → download → delete', async () => {
    const { app } = await adminCtx();
    try {
      const create = await app.inject({ method: 'POST', url: '/api/admin/backups' });
      expect(create.statusCode).toBe(201);
      const { filename, gameCount } = create.json();
      expect(filename).toMatch(/^gameventory-backup-.*\.json$/);
      expect(gameCount).toBe(1);

      const list = await app.inject({ method: 'GET', url: '/api/admin/backups' });
      expect(list.statusCode).toBe(200);
      expect(list.json().map((b: { filename: string }) => b.filename)).toContain(filename);
      expect(list.json()[0].gameCount).toBe(1);

      const dl = await app.inject({ method: 'GET', url: `/api/admin/backups/${filename}/download` });
      expect(dl.statusCode).toBe(200);
      expect(dl.headers['content-type']).toContain('application/json');
      expect(dl.headers['content-disposition']).toContain(filename);
      expect(JSON.parse(dl.body).format).toBe('gameventory-backup');

      const del = await app.inject({ method: 'DELETE', url: `/api/admin/backups/${filename}` });
      expect(del.statusCode).toBe(204);
      const after = await app.inject({ method: 'GET', url: '/api/admin/backups' });
      expect(after.json().map((b: { filename: string }) => b.filename)).not.toContain(filename);
    } finally {
      await app.close();
    }
  });

  it('restores from an existing server file (distinct from the upload path)', async () => {
    const { app } = await adminCtx();
    try {
      const filename = (await app.inject({ method: 'POST', url: '/api/admin/backups' })).json().filename;
      const res = await app.inject({ method: 'POST', url: `/api/admin/backups/${filename}/restore` });
      expect(res.statusCode).toBe(200);
      expect(res.json().restored.games).toBe(1);
      expect(res.json().safetyBackup).toMatch(/^gameventory-backup-.*\.json$/);
    } finally {
      await app.close();
    }
  });

  it('restores from an uploaded file body', async () => {
    const { app } = await adminCtx();
    try {
      const dto = {
        format: 'gameventory-backup',
        version: 1,
        createdAt: 'x',
        counts: { games: 0, baseGames: 0, expansionLinks: 0, statHistory: 0 },
        games: [],
        expansionLinks: [],
        statHistory: [],
      };
      const res = await app.inject({ method: 'POST', url: '/api/admin/backups/restore-upload', payload: dto });
      expect(res.statusCode).toBe(200);
      expect(res.json().restored.games).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('rejects an uploaded backup with a newer/unknown version (400)', async () => {
    const { app } = await adminCtx();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/backups/restore-upload',
        payload: { format: 'gameventory-backup', version: 999, createdAt: 'x', counts: { games: 0, baseGames: 0, expansionLinks: 0, statHistory: 0 }, games: [], expansionLinks: [], statHistory: [] },
      });
      expect(res.statusCode).toBe(400);
      // The keeper game is untouched — no partial write.
      const filename = (await app.inject({ method: 'POST', url: '/api/admin/backups' })).json().filename;
      expect(filename).toMatch(/\.json$/);
    } finally {
      await app.close();
    }
  });

  it('400s a bad filename on download/restore/delete; 404s a valid-but-absent one', async () => {
    const { app } = await adminCtx();
    try {
      for (const url of [
        '/api/admin/backups/evil.json/download',
        '/api/admin/backups/evil.json',
      ]) {
        const method = url.endsWith('/download') ? 'GET' : 'DELETE';
        expect((await app.inject({ method, url })).statusCode, url).toBe(400);
      }
      const badRestore = await app.inject({ method: 'POST', url: '/api/admin/backups/evil.json/restore' });
      expect(badRestore.statusCode).toBe(400);

      const missing = await app.inject({ method: 'GET', url: '/api/admin/backups/gameventory-backup-20200101T000000000Z.json/download' });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
