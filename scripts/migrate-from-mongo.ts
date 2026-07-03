import fs from 'fs';
import type { FastifyBaseLogger } from 'fastify';
import { createDb, runMigrations } from '../src/db/index.js';
import { GameStore } from '../src/server/services/game-store.js';
import { RefreshService } from '../src/server/services/refresh.service.js';
import { BggAdapter } from '../src/core/bgg/index.js';
import { coerceDocs, scanExport, buildSeedPlan, seedFromPlan } from '../src/server/migration/mongo-import.js';

// In-process migration runner (MIGRATION-PLAN §11) — NOT through authed HTTP.
//   EXPORT_FILE=games-export.json DATABASE_URL=file:/data/gameventory.db \
//     tsx scripts/migrate-from-mongo.ts
// Re-run against a fresh export at cutover. Do NOT trigger any old-app refresh
// between export and cutover (§0.7).

const exportFile = process.env.EXPORT_FILE ?? process.argv[2];
const dbUrl = process.env.DATABASE_URL ?? 'file:./data/gameventory.db';
const dbPath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl;

const mkLog = (level: string) => (a?: unknown, b?: unknown): void => console.log(`[${level}]`, b ?? '', a ?? '');
const logger = {
  info: mkLog('info'), warn: mkLog('warn'), error: mkLog('error'),
  debug: () => {}, trace: () => {}, fatal: mkLog('fatal'),
  child: () => logger, level: 'info',
} as unknown as FastifyBaseLogger;

async function main(): Promise<void> {
  if (!exportFile) {
    console.error('Usage: EXPORT_FILE=games-export.json tsx scripts/migrate-from-mongo.ts');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(exportFile, 'utf-8')) as unknown[];
  const docs = coerceDocs(raw);
  const report = scanExport(docs);
  console.log('Scan report:', JSON.stringify(report, null, 2));
  if (report.abort) {
    console.error('ABORT: duplicate top-level bgg_ids — resolve manually before migrating.');
    process.exit(1);
  }

  await runMigrations(dbPath);
  const store = new GameStore(createDb(dbPath));
  const now = new Date();
  const counts = await seedFromPlan(store, buildSeedPlan(docs, now), now);
  console.log(`Seeded ${counts.baseCount} base + ${counts.expansionCount} expansion rows. Hydrating from BGG…`);

  const refresh = new RefreshService(store, new BggAdapter(), logger);
  await refresh.startAll();
  while (refresh.isRunning) {
    const s = refresh.getStatus();
    process.stdout.write(`\rHydrating ${s.current}/${s.total}…    `);
    await new Promise((r) => setTimeout(r, 1000));
  }
  const status = refresh.getStatus();
  console.log(`\nHydration complete. ${status.failures.length} failure(s).`);
  for (const f of status.failures) console.log(`  - ${f.bggId} ${f.name}: ${f.reason}`);

  const bases = await store.listBase();
  console.log(`Verify: ${bases.length} base games in DB (export top-level: ${report.topLevelCount}).`);
  if (report.chimeraDocs.length) console.log(`Note: ${report.chimeraDocs.length} chimera/nameless doc(s) flagged — review post-cutover.`);
  console.log('Migration complete. Expansion owned-flags are likely all-false (ledger E) — plan a manual re-tag pass.');
}

main().catch((err: unknown) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
