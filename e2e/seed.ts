import fs from 'fs';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { games } from '../src/db/schema.js';

// Seeds a fresh e2e DB, then the webServer command starts the server on it.
// Runs as the first link of the webServer command chain so there is no ordering
// race with a globalSetup.
const path = process.env.E2E_DB_PATH ?? './data/e2e-playwright.db';
fs.rmSync(path, { force: true });
fs.rmSync(`${path}-journal`, { force: true });
fs.mkdirSync('./data', { recursive: true });

const client = createClient({ url: `file:${path}` });
const db = drizzle(client);
await migrate(db, { migrationsFolder: 'drizzle' });

const now = new Date();
await db
  .insert(games)
  .values({
    bggId: 13,
    type: 'base',
    owned: true,
    played: false,
    createTime: now,
    updateTime: now,
    name: 'Catan',
    hydrated: true,
    yearPublished: 1995,
    minPlayers: 3,
    maxPlayers: 4,
    playtime: 90,
    ratingAvg: 7.1,
    ratingBavg: 6.9,
    ratingVotes: 100,
    weightAvg: 2.3,
    isCooperative: false,
    isLegacy: false,
    isCampaign: false,
    is18xx: false,
    designers: ['Klaus Teuber'],
    publishers: ['KOSMOS'],
    artists: [],
    families: [],
    categories: [],
    mechanics: ['Trading'],
  })
  .run();

client.close();
console.log('e2e seed complete');
