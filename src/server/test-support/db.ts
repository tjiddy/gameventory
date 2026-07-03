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
