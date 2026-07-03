import fs from 'fs/promises';
import path from 'path';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../../db/index.js';
import type { GameStore } from './game-store.js';
import type { OperationLock } from './operation-lock.js';
import { badRequest, conflict, notFound } from '../utils/http-error.js';
import { serializeError } from '../utils/serialize-error.js';
import type { GameRow, NewGameRow } from '../../db/schema.js';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupFile,
  type BackupGame,
  type BackupSummary,
  type BackupCreatedResponse,
  type RestoreResult,
} from '../../shared/schemas/index.js';

export interface BackupServiceOptions {
  backupDir: string;
  retention: number;
}

const FILENAME_PREFIX = 'gameventory-backup-';
// Timestamp charset + `.json`. `..`, `/`, `\` are rejected by construction.
const FILENAME_RE = /^gameventory-backup-[A-Za-z0-9._-]+\.json$/;

/**
 * Owns the durable server-side backup lifecycle (issue #3): create logical JSON
 * backups on the `/data` volume, list/download/delete them, prune to a retention
 * cap, and restore (from a server file or an uploaded DTO) with an automatic
 * pre-restore safety backup. Restore is the operation lock's sole exclusive writer;
 * `create()` (public) is a shared reader.
 */
export class BackupService {
  private backupInProgress = false;

  constructor(
    private readonly db: Db,
    private readonly store: GameStore,
    private readonly log: FastifyBaseLogger,
    private readonly opts: BackupServiceOptions,
    private readonly lock: OperationLock,
  ) {}

  // ---- create ----

  /** Public create endpoint. Takes the operation lock in SHARED mode (409s if a
   * restore holds it); a `backupInProgress` guard serialises create-vs-create. */
  async create(): Promise<BackupCreatedResponse> {
    return this.lock.runShared(() => this.createInternal());
  }

  /** Build + write a backup WITHOUT touching the operation lock. Used both by the
   * public {@link create} (already under the shared lock) and by {@link restore}'s
   * pre-restore safety backup (already under the held exclusive lock — re-acquiring
   * would self-deadlock). */
  private async createInternal(): Promise<BackupCreatedResponse> {
    if (this.backupInProgress) throw conflict('A backup is already in progress', 'BACKUP_IN_PROGRESS');
    this.backupInProgress = true;
    try {
      const createdAt = new Date();
      const dto = await this.buildSnapshot(createdAt);
      await fs.mkdir(this.opts.backupDir, { recursive: true });
      const filename = await this.uniqueFilename(basicTimestamp(createdAt));
      const full = path.join(this.opts.backupDir, filename);
      const body = JSON.stringify(dto, null, 2);
      // Atomic temp-then-rename so a crash mid-write never leaves a torn file.
      const tmp = full + '.tmp';
      await fs.writeFile(tmp, body, 'utf-8');
      await fs.rename(tmp, full);
      await this.prune();
      const size = Buffer.byteLength(body);
      return { filename, createdAt: dto.createdAt, size, gameCount: dto.counts.baseGames };
    } finally {
      this.backupInProgress = false;
    }
  }

  /** Resolve a collision-free filename. Two backups in the same millisecond get an
   * ascending `_N` suffix that still sorts chronologically (`_` > `.`). */
  private async uniqueFilename(stamp: string): Promise<string> {
    const base = FILENAME_PREFIX + stamp;
    for (let n = 0; ; n++) {
      const candidate = n === 0 ? `${base}.json` : `${base}_${n}.json`;
      try {
        await fs.access(path.join(this.opts.backupDir, candidate));
      } catch {
        return candidate; // does not exist yet
      }
    }
  }

  /** Read all three tables inside ONE read `db.transaction` so the exported arrays
   * reflect one consistent point in time even if a refresh commits mid-read. */
  private async buildSnapshot(createdAt: Date): Promise<BackupFile> {
    const snap = await this.db.transaction(async (tx) => {
      const gameRows = await this.store.listAllGames(tx);
      const links = await this.store.listAllExpansionLinksByBgg(tx);
      const stats = await this.store.listAllStatHistoryByBgg(tx);
      return { gameRows, links, stats };
    });

    const games = snap.gameRows.map(rowToBackupGame).sort((a, b) => a.bggId - b.bggId);
    const expansionLinks = [...snap.links].sort(
      (a, b) => a.baseBggId - b.baseBggId || a.expansionBggId - b.expansionBggId,
    );
    const statHistory = [...snap.stats].sort(
      (a, b) => a.bggId - b.bggId || a.sampledDay.localeCompare(b.sampledDay),
    );
    const baseGames = games.filter((g) => g.type === 'base').length;

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: createdAt.toISOString(),
      counts: {
        games: games.length,
        baseGames,
        expansionLinks: expansionLinks.length,
        statHistory: statHistory.length,
      },
      games,
      expansionLinks,
      statHistory,
    };
  }

  // ---- list / prune ----

  /** List backups (newest first) for the UI, reading each file's `counts.baseGames`
   * header for the **Games** column. A file whose name or contents don't parse is
   * still listed (count `—`) rather than hidden. */
  async list(): Promise<BackupSummary[]> {
    let names: string[];
    try {
      names = await fs.readdir(this.opts.backupDir);
    } catch {
      return []; // dir not created yet
    }
    const out: BackupSummary[] = [];
    for (const name of names) {
      if (!name.startsWith(FILENAME_PREFIX) || !name.endsWith('.json')) continue;
      const full = path.join(this.opts.backupDir, name);
      const st = await fs.stat(full);
      if (!st.isFile()) continue;
      let gameCount: number | null = null;
      let createdAt: string | null = null;
      try {
        const parsed = JSON.parse(await fs.readFile(full, 'utf-8')) as unknown;
        const counts = (parsed as { counts?: { baseGames?: unknown } }).counts;
        if (typeof counts?.baseGames === 'number') gameCount = counts.baseGames;
        const ca = (parsed as { createdAt?: unknown }).createdAt;
        if (typeof ca === 'string') createdAt = ca;
      } catch {
        /* corrupt/renamed — still listed with a null count */
      }
      out.push({ filename: name, gameCount, createdAt: createdAt ?? st.mtime.toISOString(), size: st.size });
    }
    // Filenames embed a fixed-width basic-ISO timestamp → lexical sort is chronological.
    out.sort((a, b) => b.filename.localeCompare(a.filename));
    return out;
  }

  /** Keep the newest `retention` backups; unlink the rest (oldest-first by name). */
  async prune(): Promise<void> {
    let names: string[];
    try {
      names = await fs.readdir(this.opts.backupDir);
    } catch {
      return;
    }
    const backups = names.filter((n) => n.startsWith(FILENAME_PREFIX) && n.endsWith('.json')).sort();
    const excess = backups.length - this.opts.retention;
    for (let i = 0; i < excess; i++) {
      await fs.unlink(path.join(this.opts.backupDir, backups[i]!)).catch(() => {});
    }
  }

  // ---- path guard / download / delete ----

  /** Resolve + validate a backup filename to its absolute path. Rejects `..`/`/`/`\`
   * and anything not matching `gameventory-backup-*.json` with 400. */
  getBackupPath(filename: string): string {
    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\') ||
      !FILENAME_RE.test(filename)
    ) {
      throw badRequest('Invalid backup filename', 'INVALID_FILENAME');
    }
    return path.join(this.opts.backupDir, filename);
  }

  /** Read a backup's raw bytes for download; 404 if the (valid) filename is absent. */
  async readBackup(filename: string): Promise<Buffer> {
    const full = this.getBackupPath(filename);
    try {
      return await fs.readFile(full);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw notFound('Backup not found', 'BACKUP_NOT_FOUND');
      }
      throw e;
    }
  }

  async deleteBackup(filename: string): Promise<void> {
    const full = this.getBackupPath(filename);
    try {
      await fs.unlink(full);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw notFound('Backup not found', 'BACKUP_NOT_FOUND');
      }
      throw e;
    }
  }

  // ---- restore ----

  /** Restore from an existing server-side file (parses + version-gates it). */
  async restoreFromFile(filename: string): Promise<RestoreResult> {
    const full = this.getBackupPath(filename);
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(full, 'utf-8'));
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw notFound('Backup not found', 'BACKUP_NOT_FOUND');
      }
      throw badRequest('Backup file is unreadable or corrupt', 'CORRUPT_BACKUP');
    }
    const parsed = BackupFile.safeParse(raw);
    if (!parsed.success) throw badRequest('Backup failed validation', 'INVALID_BACKUP');
    return this.restore(parsed.data);
  }

  /**
   * Restore a validated backup. Acquires the operation lock EXCLUSIVELY (the sole
   * writer), takes a pre-restore safety backup, then in ONE `db.transaction` wipes
   * all games and re-inserts games / expansion links / stat-history. A failure
   * anywhere in the transaction rolls back, leaving the prior library intact.
   */
  async restore(dto: BackupFile): Promise<RestoreResult> {
    return this.lock.runExclusive(async () => {
      // Undoability: reuse the internal build under the HELD exclusive lock — never
      // re-acquire (that would self-deadlock against ourselves).
      const safety = await this.createInternal();

      const warnings: string[] = [];
      const restored = { games: 0, expansionLinks: 0, statHistory: 0 };

      await this.db.transaction(async (tx) => {
        await this.store.wipeAllGames(tx);

        const bggToId = new Map<number, number>();
        for (const g of dto.games) {
          const row = await this.store.insertGame(backupGameToNewRow(g), tx);
          bggToId.set(g.bggId, row.id);
        }
        restored.games = dto.games.length;

        for (const link of dto.expansionLinks) {
          const baseId = bggToId.get(link.baseBggId);
          const expId = bggToId.get(link.expansionBggId);
          if (baseId === undefined || expId === undefined) {
            warnings.push(`Skipped dangling expansion link ${link.baseBggId} → ${link.expansionBggId}`);
            continue;
          }
          await this.store.linkExpansion(baseId, expId, tx);
          restored.expansionLinks += 1;
        }

        for (const s of dto.statHistory) {
          const gameId = bggToId.get(s.bggId);
          if (gameId === undefined) {
            warnings.push(`Skipped dangling stat sample for bggId ${s.bggId}`);
            continue;
          }
          await this.store.insertStatHistoryRaw(
            {
              gameId,
              sampledDay: s.sampledDay,
              rank: s.rank,
              ratingAvg: s.ratingAvg,
              ratingBavg: s.ratingBavg,
              weightAvg: s.weightAvg,
              ratingVotes: s.ratingVotes,
            },
            tx,
          );
          restored.statHistory += 1;
        }
      });

      this.log.info(
        { safetyBackup: safety.filename, ...restored, warnings: warnings.length },
        'Restored library from backup',
      );
      return { restored, warnings, safetyBackup: safety.filename };
    }).catch((e: unknown) => {
      // Surface HttpErrors (409/400/404) unchanged; log the rest for diagnosis.
      if (e instanceof Error && 'statusCode' in e) throw e;
      this.log.error({ error: serializeError(e) }, 'Restore failed');
      throw e;
    });
  }
}

/** `2026-07-03T04:15:00.123Z` → `20260703T041500123Z` (colon-free, sortable). */
function basicTimestamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');
}

function rowToBackupGame(row: GameRow): BackupGame {
  return {
    bggId: row.bggId,
    type: row.type,
    owned: row.owned,
    played: row.played,
    createTime: row.createTime.toISOString(),
    hydrated: row.hydrated,
    name: row.name,
    description: row.description,
    tagline: row.tagline,
    bggUrl: row.bggUrl,
    thumbnail: row.thumbnail,
    image: row.image,
    yearPublished: row.yearPublished,
    minPlayers: row.minPlayers,
    maxPlayers: row.maxPlayers,
    playtime: row.playtime,
    minPlaytime: row.minPlaytime,
    maxPlaytime: row.maxPlaytime,
    ratingAvg: row.ratingAvg,
    ratingBavg: row.ratingBavg,
    ratingStdev: row.ratingStdev,
    ratingVotes: row.ratingVotes,
    weightAvg: row.weightAvg,
    weightVotes: row.weightVotes,
    rank: row.rank,
    isCooperative: row.isCooperative,
    isLegacy: row.isLegacy,
    isCampaign: row.isCampaign,
    is18xx: row.is18xx,
    designers: row.designers,
    publishers: row.publishers,
    artists: row.artists,
    families: row.families,
    categories: row.categories,
    mechanics: row.mechanics,
    updateTime: row.updateTime.toISOString(),
  };
}

function backupGameToNewRow(g: BackupGame): NewGameRow {
  return {
    bggId: g.bggId,
    type: g.type,
    owned: g.owned,
    played: g.played,
    createTime: new Date(g.createTime),
    hydrated: g.hydrated,
    name: g.name,
    description: g.description,
    tagline: g.tagline,
    bggUrl: g.bggUrl,
    thumbnail: g.thumbnail,
    image: g.image,
    yearPublished: g.yearPublished,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    playtime: g.playtime,
    minPlaytime: g.minPlaytime,
    maxPlaytime: g.maxPlaytime,
    ratingAvg: g.ratingAvg,
    ratingBavg: g.ratingBavg,
    ratingStdev: g.ratingStdev,
    ratingVotes: g.ratingVotes,
    weightAvg: g.weightAvg,
    weightVotes: g.weightVotes,
    rank: g.rank,
    isCooperative: g.isCooperative,
    isLegacy: g.isLegacy,
    isCampaign: g.isCampaign,
    is18xx: g.is18xx,
    designers: g.designers,
    publishers: g.publishers,
    artists: g.artists,
    families: g.families,
    categories: g.categories,
    mechanics: g.mechanics,
    updateTime: new Date(g.updateTime),
  };
}
