import { eq, and, asc, count } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import type { DbOrTx } from '../../db/client.js';
import { games, gameExpansions, gameStatHistory, type GameRow, type NewGameRow } from '../../db/schema.js';
import { buildBggDerivedUpdate } from './bgg-derived.js';
import type { BggThing, BggExpansionLink, BggThingType } from '../../core/bgg/index.js';

/** A stat-history row keyed on a resolved (reassigned) game id — the backup restore
 * path maps `bggId → newId` before calling {@link GameStore.insertStatHistoryRaw}. */
export interface RawStatSample {
  gameId: number;
  sampledDay: string;
  rank: number | null;
  ratingAvg: number | null;
  ratingBavg: number | null;
  weightAvg: number | null;
  ratingVotes: number | null;
}

export interface RefreshRow {
  id: number;
  bggId: number;
  name: string;
  type: BggThingType;
}

/**
 * The DB gateway for games/expansions/stat-history. Holds no business rules beyond
 * the invariants baked into the schema — orchestration (add flow, refresh) lives in
 * the services above it. The one load-bearing rule enforced here: applyBggDerived
 * writes ONLY BGG-derived columns (via buildBggDerivedUpdate).
 */
export class GameStore {
  constructor(private readonly db: Db) {}

  // ---- reads ----

  async getByBggId(bggId: number): Promise<GameRow | undefined> {
    return this.db.select().from(games).where(eq(games.bggId, bggId)).get();
  }

  async listBase(): Promise<GameRow[]> {
    return this.db.select().from(games).where(eq(games.type, 'base')).all();
  }

  async getExpansionsForBase(baseId: number): Promise<GameRow[]> {
    const rows = await this.db
      .select()
      .from(gameExpansions)
      .innerJoin(games, eq(gameExpansions.expansionGameId, games.id))
      .where(eq(gameExpansions.baseGameId, baseId))
      .orderBy(asc(games.yearPublished), asc(games.name))
      .all();
    return rows.map((r) => r.games);
  }

  async listAllForRefresh(): Promise<RefreshRow[]> {
    return this.db
      .select({ id: games.id, bggId: games.bggId, name: games.name, type: games.type })
      .from(games)
      .all();
  }

  // ---- full-library snapshot reads (backup export) ----
  // These accept an optional tx so BackupService.create() can run all three inside
  // ONE read db.transaction for a coherent snapshot against a concurrent refresh.

  /** Every game row, verbatim (base and expansion). */
  async listAllGames(tx?: DbOrTx): Promise<GameRow[]> {
    return (tx ?? this.db).select().from(games).all();
  }

  /** Every base↔expansion junction, exported as portable `bggId` pairs. */
  async listAllExpansionLinksByBgg(
    tx?: DbOrTx,
  ): Promise<{ baseBggId: number; expansionBggId: number }[]> {
    const conn = tx ?? this.db;
    const idToBgg = await this.idToBggMap(conn);
    const rows = await conn.select().from(gameExpansions).all();
    return rows.map((r) => ({
      baseBggId: idToBgg.get(r.baseGameId)!,
      expansionBggId: idToBgg.get(r.expansionGameId)!,
    }));
  }

  /** Every stat-history sample, keyed on the portable `bggId`. */
  async listAllStatHistoryByBgg(tx?: DbOrTx): Promise<
    {
      bggId: number;
      sampledDay: string;
      rank: number | null;
      ratingAvg: number | null;
      ratingBavg: number | null;
      weightAvg: number | null;
      ratingVotes: number | null;
    }[]
  > {
    const conn = tx ?? this.db;
    const idToBgg = await this.idToBggMap(conn);
    const rows = await conn.select().from(gameStatHistory).all();
    return rows.map((r) => ({
      bggId: idToBgg.get(r.gameId)!,
      sampledDay: r.sampledDay,
      rank: r.rank,
      ratingAvg: r.ratingAvg,
      ratingBavg: r.ratingBavg,
      weightAvg: r.weightAvg,
      ratingVotes: r.ratingVotes,
    }));
  }

  private async idToBggMap(conn: DbOrTx): Promise<Map<number, number>> {
    const rows = await conn.select({ id: games.id, bggId: games.bggId }).from(games).all();
    return new Map(rows.map((r) => [r.id, r.bggId]));
  }

  // ---- restore writes (used inside a single db.transaction) ----

  /** Wipe every game row. FK cascades clear junctions + stat-history; `users`
   * is a separate table and is untouched. */
  async wipeAllGames(tx: DbOrTx): Promise<void> {
    await tx.delete(games).run();
  }

  /** Raw stat-history insert for restore (the BGG-shaped {@link insertStatSample}
   * is unusable here). Intra-file dedup only — the unique key is the reassigned
   * `gameId`, so `onConflictDoNothing` drops duplicate (gameId, sampledDay) pairs
   * without aborting the surrounding transaction. */
  async insertStatHistoryRaw(sample: RawStatSample, tx?: DbOrTx): Promise<void> {
    await (tx ?? this.db).insert(gameStatHistory).values(sample).onConflictDoNothing().run();
  }

  // ---- user-state writes (add flow, PATCH) ----

  async insertGame(values: NewGameRow, tx?: DbOrTx): Promise<GameRow> {
    return (tx ?? this.db).insert(games).values(values).returning().get();
  }

  /** Add-flow promotion of an existing (stub) row: set its type + mark owned. */
  async promoteToAdded(id: number, type: BggThingType): Promise<void> {
    await this.db.update(games).set({ type, owned: true }).where(eq(games.id, id)).run();
  }

  async updateUserState(
    bggId: number,
    patch: { played?: boolean | undefined; owned?: boolean | undefined },
  ): Promise<GameRow | undefined> {
    const set: { played?: boolean; owned?: boolean } = {};
    if (patch.played !== undefined) set.played = patch.played;
    if (patch.owned !== undefined) set.owned = patch.owned;
    if (Object.keys(set).length === 0) return this.getByBggId(bggId);
    return this.db.update(games).set(set).where(eq(games.bggId, bggId)).returning().get();
  }

  // ---- BGG-derived writes ----

  /** The ONLY metadata write path. Structurally cannot touch user state or type. */
  async applyBggDerived(id: number, thing: BggThing, now: Date): Promise<void> {
    await this.db.update(games).set(buildBggDerivedUpdate(thing, now)).where(eq(games.id, id)).run();
  }

  /** Tagline is BGG-derived but written only at add-time / single refresh (never cron). */
  async setTagline(id: number, tagline: string): Promise<void> {
    await this.db.update(games).set({ tagline }).where(eq(games.id, id)).run();
  }

  async insertStatSample(gameId: number, thing: BggThing, sampledDay: string): Promise<void> {
    await this.db
      .insert(gameStatHistory)
      .values({
        gameId,
        sampledDay,
        ratingAvg: thing.ratingAvg,
        ratingBavg: thing.ratingBavg,
        rank: thing.rank,
        weightAvg: thing.weightAvg,
        ratingVotes: thing.ratingVotes,
      })
      .onConflictDoNothing()
      .run();
  }

  // ---- expansion reconciliation (§8.3) ----

  /**
   * Reconcile a base game's expansion links against its junctions. Upserts a stub
   * row + junction for every current link; removes junctions for links BGG no
   * longer reports, deleting the expansion row only if it is now unreferenced AND
   * not owned. Returns the BGG ids of stub rows newly created (for hydration).
   */
  async syncExpansions(baseId: number, links: BggExpansionLink[], now: Date): Promise<number[]> {
    const before = new Set(await this.junctionExpansionIds(baseId));
    const keep = new Set<number>();
    const newStubBggIds: number[] = [];

    for (const link of links) {
      const { id, created } = await this.upsertStub(link, now);
      await this.ensureJunction(baseId, id);
      keep.add(id);
      if (created) newStubBggIds.push(link.bggId);
    }

    for (const expId of before) {
      if (keep.has(expId)) continue;
      await this.db
        .delete(gameExpansions)
        .where(and(eq(gameExpansions.baseGameId, baseId), eq(gameExpansions.expansionGameId, expId)))
        .run();
      await this.deleteIfOrphan(expId);
    }

    return newStubBggIds;
  }

  async deleteBase(bggId: number): Promise<'ok' | 'not-found' | 'is-expansion'> {
    const row = await this.getByBggId(bggId);
    if (!row) return 'not-found';
    if (row.type !== 'base') return 'is-expansion';
    const expIds = await this.junctionExpansionIds(row.id);
    await this.db.delete(games).where(eq(games.id, row.id)).run(); // cascade removes junctions
    for (const expId of expIds) {
      const remaining = await this.junctionCount(expId);
      if (remaining === 0) await this.db.delete(games).where(eq(games.id, expId)).run();
    }
    return 'ok';
  }

  /** Public base↔expansion link helper (migration seeder + backup restore). */
  async linkExpansion(baseId: number, expansionId: number, tx?: DbOrTx): Promise<void> {
    await this.ensureJunction(baseId, expansionId, tx);
  }

  // ---- private helpers ----

  private async upsertStub(link: BggExpansionLink, now: Date): Promise<{ id: number; created: boolean }> {
    const inserted = await this.db
      .insert(games)
      .values({
        bggId: link.bggId,
        type: 'expansion',
        hydrated: false,
        owned: false,
        played: false,
        createTime: now,
        name: link.name,
        updateTime: now,
      })
      .onConflictDoNothing({ target: games.bggId })
      .returning({ id: games.id })
      .get();
    if (inserted) return { id: inserted.id, created: true };
    const existing = await this.db.select({ id: games.id }).from(games).where(eq(games.bggId, link.bggId)).get();
    return { id: existing!.id, created: false };
  }

  private async ensureJunction(baseId: number, expId: number, tx?: DbOrTx): Promise<void> {
    await (tx ?? this.db)
      .insert(gameExpansions)
      .values({ baseGameId: baseId, expansionGameId: expId })
      .onConflictDoNothing()
      .run();
  }

  private async junctionExpansionIds(baseId: number): Promise<number[]> {
    const rows = await this.db
      .select({ id: gameExpansions.expansionGameId })
      .from(gameExpansions)
      .where(eq(gameExpansions.baseGameId, baseId))
      .all();
    return rows.map((r) => r.id);
  }

  private async junctionCount(expId: number): Promise<number> {
    const row = await this.db
      .select({ c: count() })
      .from(gameExpansions)
      .where(eq(gameExpansions.expansionGameId, expId))
      .get();
    return row?.c ?? 0;
  }

  private async deleteIfOrphan(expId: number): Promise<void> {
    if ((await this.junctionCount(expId)) > 0) return;
    const row = await this.db.select({ owned: games.owned }).from(games).where(eq(games.id, expId)).get();
    if (row && !row.owned) await this.db.delete(games).where(eq(games.id, expId)).run();
  }
}
