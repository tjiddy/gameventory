import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from '../../db/schema.js';
import type { Db } from '../../db/index.js';

/** A fresh in-memory libSQL database with all migrations applied (per test). */
export async function makeTestDb(): Promise<Db> {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  return db;
}

const TEMP_DB_PREFIX = 'gv-testdb-';

/**
 * Best-effort removal of file-backed test DBs left behind by PRIOR runs. The
 * libSQL native binding does not release the SQLite file handle on `close()`
 * under Windows (verified: `close()` + 3s of retries never frees it), and
 * Windows refuses to unlink an open file — so a run cannot delete its own temp
 * DBs while it still holds them. Once that process exits the OS frees the
 * handles, so the NEXT run's sweep reclaims them.
 *
 * WINDOWS-ONLY, deliberately. On POSIX this sweep is unnecessary AND unsafe:
 * `cleanup()` already unlinks each dir in teardown (open files unlink fine),
 * so nothing leaks — while Vitest runs test files across concurrent workers
 * that each import this module and would fire the sweep at the SAME time. On
 * POSIX the OS happily deletes a dir another live worker is mid-transaction on,
 * pulling the db/-wal/-shm out from under it → `SQLITE_READONLY_DBMOVED` /
 * `SQLITE_IOERR`. On Windows that race is self-limiting: the OS refuses to
 * unlink a held file, so `rmSync` throws and the sibling's live DB is skipped.
 */
function sweepStaleTempDbs(): void {
  let entries: string[];
  try {
    entries = readdirSync(os.tmpdir());
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.startsWith(TEMP_DB_PREFIX)) continue;
    try {
      rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
    } catch {
      // A live run still holds this one — skip it; a later sweep gets it.
    }
  }
}
if (process.platform === 'win32') sweepStaleTempDbs();

/**
 * A fresh FILE-backed libSQL database in a temp dir, with migrations applied.
 * Required by any test that exercises `db.transaction()`: on libSQL `:memory:`
 * a query issued after a committed transaction fails — the writes/schema aren't
 * visible on the main connection (verified), so those tests need a real file.
 *
 * Returns `cleanup()`, which teardown MUST call: it closes the client, then
 * removes the temp dir. On Windows that rm is best-effort — the handle can't be
 * released mid-process (see sweepStaleTempDbs), so an EBUSY/EPERM there is
 * swallowed and the dir is reclaimed by the next run's sweep. Any other error
 * is real and re-thrown.
 */
export async function makeTestDbFile(): Promise<{ db: Db; dir: string; cleanup: () => Promise<void> }> {
  const dir = mkdtempSync(path.join(os.tmpdir(), TEMP_DB_PREFIX));
  const client = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  const cleanup = async (): Promise<void> => {
    client.close();
    try {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EBUSY' && code !== 'EPERM') throw e;
    }
  };
  return { db, dir, cleanup };
}
