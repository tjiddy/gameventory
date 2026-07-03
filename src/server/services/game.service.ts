import type { FastifyBaseLogger } from 'fastify';
import type { GameStore } from './game-store.js';
import type { BggPort } from '../../core/bgg/index.js';
import { rowToSummary, rowToDetail, rowToExpansionSummary } from './mappers.js';
import { conflict, notFound } from '../utils/http-error.js';
import type { GameSummary, GameDetail, PatchGameBody } from '../../shared/schemas/index.js';

const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

export interface GameServiceHooks {
  /** Fire-and-forget background hydration of freshly-created expansion stubs. */
  onStubsCreated?: (stubIds: number[]) => void;
}

export class GameService {
  constructor(
    private readonly store: GameStore,
    private readonly bgg: BggPort,
    private readonly log: FastifyBaseLogger,
    private readonly hooks: GameServiceHooks = {},
  ) {}

  async listGames(): Promise<GameSummary[]> {
    const rows = await this.store.listBase();
    return rows.map(rowToSummary);
  }

  async getDetail(bggId: number): Promise<GameDetail | null> {
    const row = await this.store.getByBggId(bggId);
    if (!row) return null;
    const expansions =
      row.type === 'base'
        ? (await this.store.getExpansionsForBase(row.id)).map(rowToExpansionSummary)
        : [];
    return rowToDetail(row, expansions);
  }

  /**
   * Add a game by BGG id (MIGRATION-PLAN §5/§6). New id → insert owned=true. Existing
   * expansion stub → promote (type from BGG, owned=true, played untouched). Existing
   * base → 409. Metadata + tagline are written, expansion stubs created, and their
   * background hydration scheduled.
   */
  async addGame(bggId: number): Promise<GameDetail> {
    const existing = await this.store.getByBggId(bggId);
    if (existing?.type === 'base') throw conflict('Game is already in the library', 'ALREADY_EXISTS');

    const { things } = await this.bgg.getThings([bggId]);
    const thing = things[0];
    if (!thing) throw notFound('Game not found on BoardGameGeek', 'BGG_NOT_FOUND');

    const now = new Date();
    let gameId: number;
    if (existing) {
      await this.store.promoteToAdded(existing.id, thing.type);
      gameId = existing.id;
    } else {
      const row = await this.store.insertGame({
        bggId,
        type: thing.type,
        owned: true,
        played: false,
        createTime: now,
        name: thing.name,
        updateTime: now,
      });
      gameId = row.id;
    }

    await this.store.applyBggDerived(gameId, thing, now);

    const tagline = await this.bgg.scrapeTagline(bggId);
    if (tagline) await this.store.setTagline(gameId, tagline);

    if (thing.type === 'base') {
      const newStubIds = await this.store.syncExpansions(gameId, thing.expansionLinks, now);
      if (newStubIds.length > 0) this.hooks.onStubsCreated?.(newStubIds);
    }

    await this.store.insertStatSample(gameId, thing, utcDay(now));

    const detail = await this.getDetail(bggId);
    if (!detail) throw new Error(`Game ${bggId} not found immediately after add`);
    this.log.info({ bggId, type: thing.type }, 'Added game');
    return detail;
  }

  async patchGame(bggId: number, body: PatchGameBody): Promise<GameDetail> {
    const updated = await this.store.updateUserState(bggId, body);
    if (!updated) throw notFound('Game not found', 'NOT_FOUND');
    const detail = await this.getDetail(bggId);
    if (!detail) throw notFound('Game not found', 'NOT_FOUND');
    return detail;
  }

  async deleteGame(bggId: number): Promise<void> {
    const result = await this.store.deleteBase(bggId);
    if (result === 'not-found') throw notFound('Game not found', 'NOT_FOUND');
    if (result === 'is-expansion') {
      throw conflict('Expansions cannot be deleted — toggle owned instead', 'IS_EXPANSION');
    }
    this.log.info({ bggId }, 'Deleted game');
  }
}
