import type { FastifyBaseLogger } from 'fastify';
import { createDb, runMigrations } from '../src/db/index.js';
import { config } from '../src/server/config.js';
import { GameStore } from '../src/server/services/game-store.js';
import { BackupService } from '../src/server/services/backup.service.js';
import { OperationLock } from '../src/server/services/operation-lock.js';

// Dev-only CLI backup (the slim prod image ships no tsx/scripts — prod uses the
// admin UI + the schema-break runbook in deploy/README.md).
//   DATABASE_URL=file:./config/gameventory.db pnpm backup

const mkLog = (level: string) => (a?: unknown, b?: unknown): void => console.log(`[${level}]`, b ?? '', a ?? '');
const logger = {
  info: mkLog('info'), warn: mkLog('warn'), error: mkLog('error'),
  debug: () => {}, trace: () => {}, fatal: mkLog('fatal'),
  child: () => logger, level: 'info',
} as unknown as FastifyBaseLogger;

async function main(): Promise<void> {
  await runMigrations(config.dbPath);
  const db = createDb(config.dbPath);
  const store = new GameStore(db);
  const backups = new BackupService(
    db,
    store,
    logger,
    { backupDir: config.backupDir, retention: config.backupRetention },
    new OperationLock(),
  );
  const info = await backups.create();
  console.log(`Backup written: ${info.filename} (${info.gameCount} games, ${info.size} bytes)`);
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
