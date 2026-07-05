import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { makeTestDbFile } from '../test-support/db.js';
import { silentLogger } from '../test-support/fakes.js';
import { GameStore } from './game-store.js';
import { BackupService } from './backup.service.js';
import { OperationLock } from './operation-lock.js';
import { BackupFile, BackupGame } from '../../shared/schemas/index.js';
import type { Db } from '../../db/index.js';
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

interface Harness {
  db: Db;
  store: GameStore;
  lock: OperationLock;
  dir: string;
  backups: BackupService;
}

async function makeHarness(retention = 20): Promise<Harness> {
  const { db, cleanup } = await makeTestDbFile();
  cleanups.push(cleanup);
  const store = new GameStore(db);
  const lock = new OperationLock();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gv-backup-'));
  tempDirs.push(dir);
  const backups = new BackupService(db, store, silentLogger, { backupDir: dir, retention }, lock);
  return { db, store, lock, dir, backups };
}

function newRow(over: Partial<NewGameRow> & { bggId: number }): NewGameRow {
  const now = new Date('2024-01-02T03:04:05.000Z');
  return {
    type: 'base',
    hydrated: true,
    owned: true,
    played: false,
    createTime: now,
    name: `Game ${over.bggId}`,
    rank: 100,
    ratingAvg: 7.5,
    designers: ['Klaus'],
    updateTime: now,
    ...over,
  };
}

/** Seed a base game (13) with an owned=false hydrated expansion (926), a junction,
 * and one stat sample each. Returns nothing — read back via the store. */
async function seedLibrary(store: GameStore): Promise<void> {
  const base = await store.insertGame(
    newRow({ bggId: 13, type: 'base', name: 'Catan', owned: true, played: true, rank: 392 }),
  );
  const exp = await store.insertGame(
    newRow({ bggId: 926, type: 'expansion', name: 'Seafarers', owned: false, hydrated: true }),
  );
  await store.linkExpansion(base.id, exp.id);
  await store.insertStatHistoryRaw({
    gameId: base.id,
    sampledDay: '2026-07-03',
    rank: 392,
    ratingAvg: 7.1,
    ratingBavg: 6.9,
    weightAvg: 2.3,
    ratingVotes: 12345,
  });
}

async function readBackup(dir: string, filename: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(path.join(dir, filename), 'utf-8'));
}

describe('BackupService.create — snapshot + counts', () => {
  it('writes a gameventory-backup-*.json with the full logical library and counts', async () => {
    const { store, dir, backups } = await makeHarness();
    await seedLibrary(store);

    const info = await backups.create();
    expect(info.filename).toMatch(/^gameventory-backup-.*\.json$/);
    expect(info.gameCount).toBe(1); // baseGames

    const file = (await readBackup(dir, info.filename)) as Record<string, unknown>;
    const parsed = BackupFile.parse(file);
    expect(parsed.counts).toEqual({ games: 2, baseGames: 1, expansionLinks: 1, statHistory: 1 });
    expect(parsed.games.map((g) => g.bggId)).toEqual([13, 926]);
    expect(parsed.expansionLinks).toEqual([{ baseBggId: 13, expansionBggId: 926 }]);
    expect(parsed.statHistory[0]).toMatchObject({ bggId: 13, sampledDay: '2026-07-03', rank: 392 });
    // gameCount return == counts.baseGames
    expect(info.gameCount).toBe(parsed.counts.baseGames);
  });

  it('counts.games includes base AND expansion rows; baseGames is base-only', async () => {
    const { store, dir, backups } = await makeHarness();
    await store.insertGame(newRow({ bggId: 1, type: 'base' }));
    await store.insertGame(newRow({ bggId: 2, type: 'base' }));
    await store.insertGame(newRow({ bggId: 3, type: 'expansion', owned: false }));

    const info = await backups.create();
    const parsed = BackupFile.parse(await readBackup(dir, info.filename));
    expect(parsed.counts.games).toBe(3);
    expect(parsed.counts.baseGames).toBe(2);
    expect(info.gameCount).toBe(2);
  });

  it('builds the snapshot inside one read transaction (coherent array lengths)', async () => {
    const { store, dir, backups } = await makeHarness();
    await seedLibrary(store);
    const info = await backups.create();
    const parsed = BackupFile.parse(await readBackup(dir, info.filename));
    // The header counts must equal the actual array lengths — the read-transaction
    // build can't produce a torn file where counts and arrays disagree.
    expect(parsed.counts.games).toBe(parsed.games.length);
    expect(parsed.counts.expansionLinks).toBe(parsed.expansionLinks.length);
    expect(parsed.counts.statHistory).toBe(parsed.statHistory.length);
  });

  it('passes ONE shared transaction handle to all three snapshot reads', async () => {
    const { store, backups } = await makeHarness();
    await seedLibrary(store);

    // Spy (call-through) on the three snapshot reads and capture the tx arg each got.
    const gamesSpy = vi.spyOn(store, 'listAllGames');
    const linksSpy = vi.spyOn(store, 'listAllExpansionLinksByBgg');
    const statsSpy = vi.spyOn(store, 'listAllStatHistoryByBgg');

    await backups.create();

    // Each read runs exactly once, and each receives a DEFINED tx handle — not the
    // implicit `this.db` fallback. Removing the `db.transaction` wrapper in
    // buildSnapshot() would call these with `undefined`, failing this assertion.
    expect(gamesSpy).toHaveBeenCalledTimes(1);
    expect(linksSpy).toHaveBeenCalledTimes(1);
    expect(statsSpy).toHaveBeenCalledTimes(1);
    const txHandles = [gamesSpy.mock.calls[0]?.[0], linksSpy.mock.calls[0]?.[0], statsSpy.mock.calls[0]?.[0]];
    for (const tx of txHandles) expect(tx).toBeDefined();
    // …and it is the SAME transaction object across all three reads (one snapshot).
    expect(txHandles[1]).toBe(txHandles[0]);
    expect(txHandles[2]).toBe(txHandles[0]);
  });
});

describe('BackupService — round trip', () => {
  it('seed → backup → restore → backup deep-equals except createdAt', async () => {
    const { store, dir, backups } = await makeHarness();
    await seedLibrary(store);

    const b1 = await backups.create();
    const file1 = (await readBackup(dir, b1.filename)) as Record<string, unknown>;

    await backups.restore(BackupFile.parse(file1));

    const b2 = await backups.create();
    const file2 = (await readBackup(dir, b2.filename)) as Record<string, unknown>;

    delete file1.createdAt;
    delete file2.createdAt;
    expect(file2).toEqual(file1);
  });

  it('preserves owned/played/createTime/type byte-identically and restores cache', async () => {
    const { store, dir, backups } = await makeHarness();
    await seedLibrary(store);
    const before = await store.getByBggId(13);

    const b1 = await backups.create();
    await backups.restore(BackupFile.parse(await readBackup(dir, b1.filename)));

    const after = await store.getByBggId(13);
    expect(after?.owned).toBe(before?.owned);
    expect(after?.played).toBe(before?.played);
    expect(after?.type).toBe(before?.type);
    expect(after?.createTime.getTime()).toBe(before?.createTime.getTime());
    // Cache is back (offline restore issues no BGG calls — BackupService has no adapter).
    expect(after?.hydrated).toBe(true);
    expect(after?.rank).toBe(392);
    expect(after?.designers).toEqual(['Klaus']);
    // users table untouched by wipeAllGames (no user seeded → still empty, no error).
  });
});

describe('BackupService.restore — atomicity + safety backup', () => {
  it('takes a pre-restore safety backup', async () => {
    const { store, dir, backups } = await makeHarness();
    await seedLibrary(store);
    const b1 = await backups.create();
    const result = await backups.restore(BackupFile.parse(await readBackup(dir, b1.filename)));
    expect(result.safetyBackup).toMatch(/^gameventory-backup-.*\.json$/);
    expect(result.safetyBackup).not.toBe(b1.filename);
    const names = await fs.readdir(dir);
    expect(names).toContain(result.safetyBackup);
  });

  it('rolls back on a mid-restore failure, leaving the prior library intact', async () => {
    const { store, backups } = await makeHarness();
    await store.insertGame(newRow({ bggId: 13, type: 'base', name: 'Keeper' }));

    // A dto with a duplicate bggId trips the unique constraint on the 2nd insert.
    const dup = (bggId: number): BackupGame => BackupGame.parse({ bggId, type: 'base', owned: true, played: false, createTime: '2024-01-01T00:00:00.000Z', name: `x${bggId}`, updateTime: '2024-01-01T00:00:00.000Z' });
    const dto = BackupFile.parse({
      format: 'gameventory-backup',
      version: 1,
      createdAt: '2024-01-01T00:00:00.000Z',
      counts: { games: 2, baseGames: 2, expansionLinks: 0, statHistory: 0 },
      games: [dup(99), dup(99)],
      expansionLinks: [],
      statHistory: [],
    });

    await expect(backups.restore(dto)).rejects.toThrow();
    // Rolled back: original library present, the partial insert gone.
    expect(await store.getByBggId(13)).toBeDefined();
    expect(await store.getByBggId(99)).toBeUndefined();
  });

  it('skips dangling expansion links and stat samples, restoring only resolvable rows', async () => {
    const { store, backups } = await makeHarness();
    // A valid backup: one resolvable base game, plus a link and a stat sample whose
    // bggIds are absent from `games` (dangling references a real export can carry).
    const dto = BackupFile.parse({
      format: 'gameventory-backup',
      version: 1,
      createdAt: '2024-01-01T00:00:00.000Z',
      counts: { games: 1, baseGames: 1, expansionLinks: 1, statHistory: 1 },
      games: [
        BackupGame.parse({
          bggId: 13, type: 'base', owned: true, played: false,
          createTime: '2024-01-01T00:00:00.000Z', name: 'Catan', updateTime: '2024-01-01T00:00:00.000Z',
        }),
      ],
      expansionLinks: [{ baseBggId: 13, expansionBggId: 926 }], // 926 not in games
      statHistory: [
        { bggId: 555, sampledDay: '2026-07-03', rank: 1, ratingAvg: 7, ratingBavg: 6, weightAvg: 2, ratingVotes: 5 }, // 555 not in games
      ],
    });

    const result = await backups.restore(dto);

    // The restore succeeds and the resolvable game is present.
    expect(await store.getByBggId(13)).toBeDefined();
    // Dangling rows were skipped, not counted.
    expect(result.restored).toMatchObject({ games: 1, expansionLinks: 0, statHistory: 0 });
    // Both skips surface as warnings (backup.service.ts:270, :280).
    expect(result.warnings).toContain('Skipped dangling expansion link 13 → 926');
    expect(result.warnings).toContain('Skipped dangling stat sample for bggId 555');
  });

  it('restores duplicate (bggId, sampledDay) stat samples via onConflictDoNothing', async () => {
    const { store, dir, backups } = await makeHarness();
    await store.insertGame(newRow({ bggId: 13, type: 'base' }));
    const b1 = await backups.create();
    const file = (await readBackup(dir, b1.filename)) as Record<string, unknown>;
    // Inject two identical stat samples for the same bggId+day.
    (file as { statHistory: unknown[] }).statHistory = [
      { bggId: 13, sampledDay: '2026-07-03', rank: 1, ratingAvg: 7, ratingBavg: 6, weightAvg: 2, ratingVotes: 5 },
      { bggId: 13, sampledDay: '2026-07-03', rank: 1, ratingAvg: 7, ratingBavg: 6, weightAvg: 2, ratingVotes: 5 },
    ];
    const result = await backups.restore(BackupFile.parse(file));
    // Both counted as processed; the second is silently deduped at the DB layer.
    expect(result.restored.statHistory).toBe(2);
    expect(await store.getByBggId(13)).toBeDefined();
  });
});

describe('BackupService — schema tolerance', () => {
  it('ignores unknown fields and defaults missing optional cache fields', () => {
    const parsed = BackupFile.parse({
      format: 'gameventory-backup',
      version: 1,
      createdAt: 'x',
      counts: { games: 1, baseGames: 1, expansionLinks: 0, statHistory: 0 },
      games: [
        { bggId: 5, type: 'base', owned: true, played: false, createTime: 'x', name: 'N', updateTime: 'x', SURPRISE: 'ignored' },
      ],
      expansionLinks: [],
      statHistory: [],
      EXTRA: 'ignored',
    });
    expect((parsed as unknown as { EXTRA?: string }).EXTRA).toBeUndefined();
    expect(parsed.games[0]?.description).toBeNull(); // missing optional → default null
    expect(parsed.games[0]?.hydrated).toBe(false);
  });

  it('rejects a newer/unknown version with no partial write', async () => {
    const { store, dir, backups } = await makeHarness();
    await store.insertGame(newRow({ bggId: 13, type: 'base' }));
    // A v999 file on disk → restoreFromFile → 400, library unchanged.
    const filename = 'gameventory-backup-20990101T000000000Z.json';
    await fs.writeFile(
      path.join(dir, filename),
      JSON.stringify({ format: 'gameventory-backup', version: 999, createdAt: 'x', counts: { games: 0, baseGames: 0, expansionLinks: 0, statHistory: 0 }, games: [], expansionLinks: [], statHistory: [] }),
    );
    await expect(backups.restoreFromFile(filename)).rejects.toMatchObject({ statusCode: 400 });
    expect(await store.getByBggId(13)).toBeDefined(); // untouched
    expect(BackupFile.safeParse({ version: 999 }).success).toBe(false);
  });
});

describe('BackupService — path traversal guard', () => {
  it('rejects .. / slashes and non-gameventory-backup filenames with 400', async () => {
    const { backups } = await makeHarness();
    for (const bad of ['../../etc/passwd', 'gameventory-backup-../x.json', 'evil.json', 'foo/bar.json', 'a\\b.json']) {
      expect(() => backups.getBackupPath(bad), bad).toThrow();
    }
    expect(backups.getBackupPath('gameventory-backup-20260101T000000000Z.json')).toContain('gameventory-backup-');
  });
});

describe('BackupService.list — robustness + retention', () => {
  it('lists a corrupt/renamed backup file with a null (—) count', async () => {
    const { dir, backups } = await makeHarness();
    await fs.writeFile(path.join(dir, 'gameventory-backup-20260101T000000000Z.json'), 'not json {{{');
    const list = await backups.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.gameCount).toBeNull();
  });

  it('prunes oldest beyond BACKUP_RETENTION on create', async () => {
    const { store, dir, backups } = await makeHarness(2);
    await store.insertGame(newRow({ bggId: 1, type: 'base' }));
    await backups.create();
    await backups.create();
    await backups.create();
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'));
    expect(names).toHaveLength(2); // oldest pruned
  });

  it('reads counts.baseGames for the Games column', async () => {
    const { store, backups } = await makeHarness();
    await store.insertGame(newRow({ bggId: 1, type: 'base' }));
    await store.insertGame(newRow({ bggId: 2, type: 'expansion', owned: false }));
    await backups.create();
    const list = await backups.list();
    expect(list[0]?.gameCount).toBe(1); // base-only
  });
});
