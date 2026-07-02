import { sqliteTable, integer, text, real, primaryKey, unique } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// games — one row per BGG "thing" (base game OR expansion). Self-referential via
// the game_expansions junction. `bggId` is the global identity: one row per BGG
// thing, ever. See MIGRATION-PLAN §5 for the type/upsert invariants.
//
// HARD RULE (§0.3): the refresh/hydration pipeline may only write the columns
// tagged "BGG-derived" below. It must NEVER write owned/played/createTime or
// promote/demote `type`. The §12 write-set test enforces this.
// ---------------------------------------------------------------------------
export const games = sqliteTable('games', {
  id: integer().primaryKey({ autoIncrement: true }),
  bggId: integer('bgg_id').notNull().unique(),
  type: text({ enum: ['base', 'expansion'] }).notNull(),
  hydrated: integer({ mode: 'boolean' }).notNull().default(false),

  // ---- user state: ONLY the add-flow, PATCH route, and migration write these ----
  // No defaults on owned/played: every insert path must state them explicitly so a
  // stub is never silently "owned".
  owned: integer({ mode: 'boolean' }).notNull(),
  played: integer({ mode: 'boolean' }).notNull(),
  createTime: integer('create_time', { mode: 'timestamp' }).notNull(),

  // ---- BGG-derived: ONLY the adapter-fed refresh/hydration/add paths write these ----
  name: text().notNull(),
  description: text(),
  tagline: text(), // scraped; never written by the weekly cron (§7.5)
  bggUrl: text('bgg_url'),
  thumbnail: text(),
  image: text(),
  yearPublished: integer('year_published'),
  minPlayers: integer('min_players'),
  maxPlayers: integer('max_players'),
  playtime: integer(),
  minPlaytime: integer('min_playtime'),
  maxPlaytime: integer('max_playtime'),
  ratingAvg: real('rating_avg'),
  ratingBavg: real('rating_bavg'),
  ratingStdev: real('rating_stdev'),
  ratingVotes: integer('rating_votes'),
  weightAvg: real('weight_avg'),
  weightVotes: integer('weight_votes'),
  rank: integer(), // BGG overall rank; null = unranked
  isCooperative: integer('is_cooperative', { mode: 'boolean' }).notNull().default(false),
  isLegacy: integer('is_legacy', { mode: 'boolean' }).notNull().default(false),
  isCampaign: integer('is_campaign', { mode: 'boolean' }).notNull().default(false),
  is18xx: integer('is_18xx', { mode: 'boolean' }).notNull().default(false),
  designers: text({ mode: 'json' }).$type<string[]>(), // arrays: old parser lossily truncated to first
  publishers: text({ mode: 'json' }).$type<string[]>(),
  artists: text({ mode: 'json' }).$type<string[]>(),
  families: text({ mode: 'json' }).$type<string[]>(),
  categories: text({ mode: 'json' }).$type<string[]>(),
  mechanics: text({ mode: 'json' }).$type<string[]>(),
  updateTime: integer('update_time', { mode: 'timestamp' }).notNull(),
});

// base ↔ expansion is many-to-many on BGG (a promo can attach to several bases).
export const gameExpansions = sqliteTable(
  'game_expansions',
  {
    baseGameId: integer('base_game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    expansionGameId: integer('expansion_game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.baseGameId, t.expansionGameId] })],
);

// Wide stat-history table, pre-provisioned in v1 (charts UI is post-cutover).
// One sample per (game, UTC day); the unique constraint dedupes.
export const gameStatHistory = sqliteTable(
  'game_stat_history',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    gameId: integer('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
    sampledDay: text('sampled_day').notNull(), // 'YYYY-MM-DD' UTC
    ratingAvg: real('rating_avg'),
    ratingBavg: real('rating_bavg'),
    rank: integer(),
    weightAvg: real('weight_avg'),
    ratingVotes: integer('rating_votes'),
  },
  (t) => [unique().on(t.gameId, t.sampledDay)],
);

// users — required by the lifted Authelia auth stack (§9). Single-admin in
// practice, but modeled generically. Lands with the Phase 1 schema; used in Phase 3.
export const users = sqliteTable(
  'users',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    provider: text().notNull(), // 'authelia'
    subject: text().notNull(), // OIDC `sub` claim
    email: text(),
    displayName: text('display_name'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [unique().on(t.provider, t.subject)],
);

export type GameRow = typeof games.$inferSelect;
export type NewGameRow = typeof games.$inferInsert;
export type GameExpansionRow = typeof gameExpansions.$inferSelect;
export type GameStatHistoryRow = typeof gameStatHistory.$inferSelect;
export type UserRow = typeof users.$inferSelect;
