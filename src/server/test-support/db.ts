import { mkdtempSync } from 'fs';
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

/**
 * A fresh FILE-backed libSQL database in a temp dir, with migrations applied.
 * Required by any test that exercises `db.transaction()` — libSQL `:memory:`
 * databases are per-connection, so the schema isn't visible on the separate
 * connection a transaction runs on. Returns the dir so the caller can rm it.
 */
export async function makeTestDbFile(): Promise<{ db: Db; dir: string }> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gv-testdb-'));
  const client = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });
  return { db, dir };
}
