import { z } from 'zod';

// ---------------------------------------------------------------------------
// Admin Backup & Restore DTOs (issue #3). A backup is a *logical* JSON export of
// the library — authoritative user state + the BGG cache + relationships + the
// stat-history time series — not a physical DB snapshot. It survives arbitrary
// schema changes by re-mapping on `bggId` (the portable identity; autoincrement
// `id`s are dropped and reassigned on restore).
//
// Tolerance rules (§ "Tolerance"): unknown fields are stripped (Zod is non-strict
// by default); missing optional cache fields default; a newer/unknown `version`
// fails the `z.literal` gate → a clean 400 with no partial write.
// ---------------------------------------------------------------------------

export const BACKUP_FORMAT = 'gameventory-backup';
export const BACKUP_VERSION = 1;

/**
 * One exported game row (base OR expansion). Authoritative fields are verbatim;
 * cache fields (the BGG-derived columns + `tagline`) are carried for instant,
 * offline restore. `hydrated` is serialized as the recorded cache-presence flag
 * and replayed verbatim on restore (F7 resolution) — this keeps round-trip
 * fidelity exact while still meaning "was this row's cache populated?".
 */
export const BackupGame = z.object({
  // ---- authoritative (verbatim) ----
  bggId: z.number().int(),
  type: z.enum(['base', 'expansion']),
  owned: z.boolean(),
  played: z.boolean(),
  createTime: z.string(), // ISO 8601
  // ---- cache-presence flag ----
  hydrated: z.boolean().default(false),
  // ---- BGG cache (nullable; missing → null) ----
  name: z.string(),
  description: z.string().nullable().default(null),
  tagline: z.string().nullable().default(null),
  bggUrl: z.string().nullable().default(null),
  thumbnail: z.string().nullable().default(null),
  image: z.string().nullable().default(null),
  yearPublished: z.number().int().nullable().default(null),
  minPlayers: z.number().int().nullable().default(null),
  maxPlayers: z.number().int().nullable().default(null),
  playtime: z.number().int().nullable().default(null),
  minPlaytime: z.number().int().nullable().default(null),
  maxPlaytime: z.number().int().nullable().default(null),
  ratingAvg: z.number().nullable().default(null),
  ratingBavg: z.number().nullable().default(null),
  ratingStdev: z.number().nullable().default(null),
  ratingVotes: z.number().int().nullable().default(null),
  weightAvg: z.number().nullable().default(null),
  weightVotes: z.number().int().nullable().default(null),
  rank: z.number().int().nullable().default(null),
  isCooperative: z.boolean().default(false),
  isLegacy: z.boolean().default(false),
  isCampaign: z.boolean().default(false),
  is18xx: z.boolean().default(false),
  designers: z.array(z.string()).nullable().default(null),
  publishers: z.array(z.string()).nullable().default(null),
  artists: z.array(z.string()).nullable().default(null),
  families: z.array(z.string()).nullable().default(null),
  categories: z.array(z.string()).nullable().default(null),
  mechanics: z.array(z.string()).nullable().default(null),
  updateTime: z.string(), // ISO 8601
});
export type BackupGame = z.infer<typeof BackupGame>;

/** A base↔expansion junction, exported as a portable `bggId` pair. */
export const BackupExpansionLink = z.object({
  baseBggId: z.number().int(),
  expansionBggId: z.number().int(),
});
export type BackupExpansionLink = z.infer<typeof BackupExpansionLink>;

/** One stat-history sample, keyed on the portable `bggId` + UTC day. */
export const BackupStatSample = z.object({
  bggId: z.number().int(),
  sampledDay: z.string(),
  rank: z.number().int().nullable().default(null),
  ratingAvg: z.number().nullable().default(null),
  ratingBavg: z.number().nullable().default(null),
  weightAvg: z.number().nullable().default(null),
  ratingVotes: z.number().int().nullable().default(null),
});
export type BackupStatSample = z.infer<typeof BackupStatSample>;

/**
 * `counts.games` = the number of entries in the `games` array (all rows, base AND
 * expansion). `counts.baseGames` = the `type = 'base'` subset (the library size the
 * UI **Games** column and the `create()` return's `gameCount` use).
 */
export const BackupCounts = z.object({
  games: z.number().int(),
  baseGames: z.number().int(),
  expansionLinks: z.number().int(),
  statHistory: z.number().int(),
});
export type BackupCounts = z.infer<typeof BackupCounts>;

/** The full backup file. The `version` literal gate refuses newer/unknown files. */
export const BackupFile = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  createdAt: z.string(),
  counts: BackupCounts,
  games: z.array(BackupGame),
  expansionLinks: z.array(BackupExpansionLink),
  statHistory: z.array(BackupStatSample),
});
export type BackupFile = z.infer<typeof BackupFile>;

// ---- API response DTOs ----

/** A row in `GET /api/admin/backups`. `gameCount` is null when the file's header
 * can't be parsed (still listed, never hidden). */
export const BackupSummary = z.object({
  filename: z.string(),
  gameCount: z.number().int().nullable(),
  createdAt: z.string().nullable(),
  size: z.number().int(),
});
export type BackupSummary = z.infer<typeof BackupSummary>;

export const BackupList = z.array(BackupSummary);

/** `POST /api/admin/backups` result. `gameCount` = `counts.baseGames`. */
export const BackupCreatedResponse = z.object({
  filename: z.string(),
  createdAt: z.string(),
  size: z.number().int(),
  gameCount: z.number().int(),
});
export type BackupCreatedResponse = z.infer<typeof BackupCreatedResponse>;

/** Restore result — counts actually applied, non-fatal warnings, and the name of
 * the automatic pre-restore safety backup. */
export const RestoreResult = z.object({
  restored: z.object({
    games: z.number().int(),
    expansionLinks: z.number().int(),
    statHistory: z.number().int(),
  }),
  warnings: z.array(z.string()),
  safetyBackup: z.string(),
});
export type RestoreResult = z.infer<typeof RestoreResult>;
