import fs from 'fs';
import type { FastifyBaseLogger } from 'fastify';
import { createDb, runMigrations } from '../src/db/index.js';
import { config } from '../src/server/config.js';
import { GameStore } from '../src/server/services/game-store.js';
import { BackupService } from '../src/server/services/backup.service.js';
import { OperationLock } from '../src/server/services/operation-lock.js';
import { BackupFile } from '../src/shared/schemas/index.js';

// Dev-only CLI restore (see scripts/backup.ts). Replaces the WHOLE library — a
// pre-restore safety backup is taken first.
//   DATABASE_URL=file:./config/gameventory.db pnpm restore <file> --replace

const mkLog = (level: string) => (a?: unknown, b?: unknown): void => console.log(`[${level}]`, b ?? '', a ?? '');
const logger = {
  info: mkLog('info'), warn: mkLog('warn'), error: mkLog('error'),
  debug: () => {}, trace: () => {}, fatal: mkLog('fatal'),
  child: () => logger, level: 'info',
} as unknown as FastifyBaseLogger;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const replace = args.includes('--replace');
  if (!file) {
    console.error('Usage: pnpm restore <file> --replace');
    process.exit(1);
  }
  if (!replace) {
    console.error('Restore replaces the ENTIRE library. Re-run with --replace to confirm.');
    process.exit(1);
  }

  const parsed = BackupFile.parse(JSON.parse(fs.readFileSync(file, 'utf-8')));
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
  const result = await backups.restore(parsed);
  console.log(
    `Restored ${result.restored.games} games, ${result.restored.expansionLinks} links, ` +
      `${result.restored.statHistory} samples. Safety backup: ${result.safetyBackup}`,
  );
  if (result.warnings.length > 0) console.warn('Warnings:', result.warnings);
}

main().catch((err) => {
  console.error('Restore failed:', err);
  process.exit(1);
});
