import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { makeTestDbFile } from '../test-support/db.js';
import { makeFakeBgg, makeThing, silentLogger } from '../test-support/fakes.js';
import { GameStore } from './game-store.js';
import { GameService } from './game.service.js';
import { RefreshService } from './refresh.service.js';
import { BackupService } from './backup.service.js';
import { OperationLock } from './operation-lock.js';
import { BackupFile } from '../../shared/schemas/index.js';
import type { BggPort, BggThingsResult } from '../../core/bgg/index.js';
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

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const EMPTY_BACKUP = BackupFile.parse({
  format: 'gameventory-backup',
  version: 1,
  createdAt: 'x',
  counts: { games: 0, baseGames: 0, expansionLinks: 0, statHistory: 0 },
  games: [],
  expansionLinks: [],
  statHistory: [],
});

function baseRow(bggId: number): NewGameRow {
  const now = new Date('2024-01-01T00:00:00.000Z');
  return { bggId, type: 'base', hydrated: true, owned: true, played: false, createTime: now, name: `G${bggId}`, updateTime: now };
}

interface Services {
  store: GameStore;
  lock: OperationLock;
  refresh: RefreshService;
  games: GameService;
  backups: BackupService;
  bgg: ReturnType<typeof makeFakeBgg>;
}

async function makeServices(bgg?: BggPort): Promise<Services> {
  const { db, cleanup } = await makeTestDbFile();
  cleanups.push(cleanup);
  const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-conc-'));
  tempDirs.push(backupDir);
  const store = new GameStore(db);
  const lock = new OperationLock();
  const fake = (bgg ?? makeFakeBgg({ things: { 13: makeThing({ bggId: 13 }), 926: makeThing({ bggId: 926, type: 'expansion' }) } })) as ReturnType<typeof makeFakeBgg>;
  const refresh = new RefreshService(store, fake, silentLogger, lock);
  const games = new GameService(store, fake, silentLogger, {}, lock);
  const backups = new BackupService(db, store, silentLogger, { backupDir, retention: 20 }, lock);
  return { store, lock, refresh, games, backups, bgg: fake };
}

describe('OperationLock semantics', () => {
  it('allows concurrent readers, blocks a writer while readers are active', async () => {
    const lock = new OperationLock();
    const g1 = deferred<void>();
    const g2 = deferred<void>();
    const r1 = lock.runShared(() => g1.promise);
    const r2 = lock.runShared(() => g2.promise); // two readers concurrently — no throw
    await expect(lock.runExclusive(async () => 'x')).rejects.toMatchObject({ statusCode: 409 });
    g1.resolve();
    g2.resolve();
    await Promise.all([r1, r2]);
    // Readers drained → the writer can now run.
    await expect(lock.runExclusive(async () => 'ok')).resolves.toBe('ok');
  });

  it('blocks a reader while a writer is active', async () => {
    const lock = new OperationLock();
    const gate = deferred<void>();
    const w = lock.runExclusive(() => gate.promise);
    expect(lock.tryAcquireShared()).toBe(false);
    await expect(lock.runShared(async () => 'x')).rejects.toMatchObject({ statusCode: 409 });
    gate.resolve();
    await w;
  });
});

describe('restore (exclusive writer) blocks every reader', () => {
  it('409s refresh, single-refresh, add/patch/delete, and backup create; hydration skips silently', async () => {
    const { refresh, games, backups, lock, bgg } = await makeServices();
    const gate = deferred<void>();
    const held = lock.runExclusive(() => gate.promise); // simulate an in-flight restore

    await expect(refresh.startAll()).rejects.toMatchObject({ statusCode: 409 });
    await expect(refresh.runSingle(13)).rejects.toMatchObject({ statusCode: 409 });
    await expect(games.addGame(13)).rejects.toMatchObject({ statusCode: 409 });
    await expect(games.patchGame(13, { owned: true })).rejects.toMatchObject({ statusCode: 409 });
    await expect(games.deleteGame(13)).rejects.toMatchObject({ statusCode: 409 });
    await expect(backups.create()).rejects.toMatchObject({ statusCode: 409 });

    // Fire-and-forget hydration skips silently — no throw, no BGG call, no writes.
    await refresh.hydrateStubs([926]);
    expect(bgg.getThingsCalls).toHaveLength(0);

    gate.resolve();
    await held;
  });
});

describe('an in-flight reader blocks a restore', () => {
  it('409s a restore while a real full refresh is running', async () => {
    const bggGate = deferred<BggThingsResult>();
    const bgg: BggPort = {
      getThings: () => bggGate.promise,
      search: async () => [],
      scrapeTagline: async () => null,
    };
    const svc = await makeServices(bgg);
    await svc.store.insertGame(baseRow(13));

    await svc.refresh.startAll(); // acquires the shared reader, hangs on getThings
    expect(svc.refresh.isRunning).toBe(true);

    await expect(svc.backups.restore(EMPTY_BACKUP)).rejects.toMatchObject({ statusCode: 409 });

    bggGate.resolve({ things: [makeThing({ bggId: 13 })], missing: [] });
    while (svc.refresh.isRunning) await sleep(5);

    // Reader drained → a restore now succeeds.
    await expect(svc.backups.restore(EMPTY_BACKUP)).resolves.toMatchObject({ restored: { games: 0 } });
  });

  it('409s a restore while a shared reader (add/hydrate/create) is in flight', async () => {
    const { backups, lock } = await makeServices();
    const gate = deferred<void>();
    const held = lock.runShared(() => gate.promise); // any reader in flight
    await expect(backups.restore(EMPTY_BACKUP)).rejects.toMatchObject({ statusCode: 409 });
    gate.resolve();
    await held;
  });
});
