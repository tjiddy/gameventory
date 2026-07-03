import type { GameRow } from '../../db/schema.js';
import type { GameSummary, GameDetail, ExpansionSummary } from '../../shared/schemas/index.js';

const arr = (v: string[] | null): string[] => v ?? [];
const ms = (d: Date): number => d.getTime();

export function rowToSummary(row: GameRow): GameSummary {
  return {
    bggId: row.bggId,
    name: row.name,
    image: row.image,
    tagline: row.tagline,
    yearPublished: row.yearPublished,
    minPlayers: row.minPlayers,
    maxPlayers: row.maxPlayers,
    playtime: row.playtime,
    ratingAvg: row.ratingAvg,
    ratingBavg: row.ratingBavg,
    ratingVotes: row.ratingVotes,
    weightAvg: row.weightAvg,
    isCooperative: row.isCooperative,
    isLegacy: row.isLegacy,
    isCampaign: row.isCampaign,
    is18xx: row.is18xx,
    designers: arr(row.designers),
    publishers: arr(row.publishers),
    artists: arr(row.artists),
    families: arr(row.families),
    categories: arr(row.categories),
    mechanics: arr(row.mechanics),
    owned: row.owned,
    played: row.played,
    createTime: ms(row.createTime),
    updateTime: ms(row.updateTime),
  };
}

export function rowToExpansionSummary(row: GameRow): ExpansionSummary {
  return {
    bggId: row.bggId,
    name: row.name,
    yearPublished: row.yearPublished,
    image: row.image,
    description: row.description,
    ratingAvg: row.ratingAvg,
    weightAvg: row.weightAvg,
    owned: row.owned,
    played: row.played,
    hydrated: row.hydrated,
  };
}

export function rowToDetail(row: GameRow, expansions: ExpansionSummary[]): GameDetail {
  return {
    ...rowToSummary(row),
    description: row.description,
    bggUrl: row.bggUrl,
    thumbnail: row.thumbnail,
    ratingStdev: row.ratingStdev,
    weightVotes: row.weightVotes,
    rank: row.rank,
    minPlaytime: row.minPlaytime,
    maxPlaytime: row.maxPlaytime,
    type: row.type,
    hydrated: row.hydrated,
    expansions,
  };
}
