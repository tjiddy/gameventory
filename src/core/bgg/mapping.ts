import type { ParsedThingItem, ParsedSearchItem } from './xml-schemas.js';
import type { BggThing, BggThingType, BggExpansionLink, BggSearchResult } from './types.js';

function toInt(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

function toFloat(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function itemType(type: string | undefined): BggThingType {
  return type === 'boardgameexpansion' ? 'expansion' : 'base';
}

/** BGG returns multiple <name> elements; the display name is the primary one. */
function primaryName(names: { type?: string | undefined; value?: string | undefined }[]): string {
  return names.find((n) => n.type === 'primary')?.value ?? names[0]?.value ?? '';
}

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"', apos: "'", lt: '<', gt: '>',
  ndash: '–', mdash: '—', hellip: '…', nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

/** Decode the HTML entities BGG leaves in scraped meta-description text. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(quot|apos|lt|gt|ndash|mdash|hellip|nbsp|rsquo|lsquo|rdquo|ldquo);/g, (_, n: string) => NAMED_ENTITIES[n] ?? _)
    .replace(/&amp;/g, '&');
}

interface MappedLinks {
  designers: string[];
  publishers: string[];
  artists: string[];
  families: string[];
  categories: string[];
  mechanics: string[];
  expansionLinks: BggExpansionLink[];
  isCooperative: boolean;
  isCampaign: boolean;
  isLegacy: boolean;
  is18xx: boolean;
}

type RawLink = { type?: string | undefined; id?: string | undefined; value?: string | undefined };

function collect(links: RawLink[], type: string): string[] {
  return links.filter((l) => l.type === type && l.value).map((l) => l.value!);
}

function mapLinks(links: RawLink[]): MappedLinks {
  const designers = collect(links, 'boardgamedesigner');
  const publishers = collect(links, 'boardgamepublisher');
  const artists = collect(links, 'boardgameartist');
  const families = collect(links, 'boardgamefamily');
  const categories = collect(links, 'boardgamecategory');
  const mechanics = collect(links, 'boardgamemechanic');
  const expansionLinks = links
    .filter((l) => l.type === 'boardgameexpansion')
    .map((l) => ({ bggId: toInt(l.id), name: l.value ?? '' }))
    .filter((e): e is BggExpansionLink => e.bggId !== null && e.name !== '');

  // Flag derivation (MIGRATION-PLAN §7.4) — case-insensitive substring matches.
  const has = (arr: string[], needle: string): boolean => arr.some((x) => x.toLowerCase().includes(needle));
  return {
    designers, publishers, artists, families, categories, mechanics, expansionLinks,
    isCooperative: has(mechanics, 'coop'),
    isCampaign: has(mechanics, 'campaign') || has(families, 'campaign'),
    isLegacy: has(mechanics, 'legacy') || has(families, 'legacy'),
    is18xx: has(families, '18xx'),
  };
}

interface MappedStats {
  ratingAvg: number | null;
  ratingBavg: number | null;
  ratingStdev: number | null;
  ratingVotes: number | null;
  weightAvg: number | null;
  weightVotes: number | null;
  rank: number | null;
}

const EMPTY_STATS: MappedStats = {
  ratingAvg: null, ratingBavg: null, ratingStdev: null, ratingVotes: null,
  weightAvg: null, weightVotes: null, rank: null,
};

function mapStats(statistics: ParsedThingItem['statistics']): MappedStats {
  const ratings = statistics?.ratings;
  if (!ratings) return EMPTY_STATS;
  const ranks = ratings.ranks?.rank ?? [];
  // The overall BGG rank is the subtype/boardgame rank; "Not Ranked" -> NaN -> null.
  const overall = ranks.find((r) => r.type === 'subtype' && r.name === 'boardgame');
  return {
    ratingAvg: toFloat(ratings.average?.value),
    ratingBavg: toFloat(ratings.bayesaverage?.value),
    ratingStdev: toFloat(ratings.stddev?.value),
    ratingVotes: toInt(ratings.usersrated?.value),
    weightAvg: toFloat(ratings.averageweight?.value),
    weightVotes: toInt(ratings.numweights?.value),
    rank: toInt(overall?.value),
  };
}

/** Map a parsed /thing item to a BggThing, or null if it lacks an id/name (per-id failure). */
export function mapThingItem(item: ParsedThingItem): BggThing | null {
  const bggId = toInt(item.id);
  if (bggId === null) return null;
  const name = primaryName(item.name ?? []);
  if (!name) return null;

  const links = mapLinks(item.link ?? []);
  const stats = mapStats(item.statistics);

  return {
    bggId,
    type: itemType(item.type),
    name,
    description: item.description || null,
    thumbnail: item.thumbnail || null,
    image: item.image || null,
    bggUrl: `https://boardgamegeek.com/boardgame/${bggId}`,
    yearPublished: toInt(item.yearpublished?.value),
    minPlayers: toInt(item.minplayers?.value),
    maxPlayers: toInt(item.maxplayers?.value),
    playtime: toInt(item.playingtime?.value),
    minPlaytime: toInt(item.minplaytime?.value),
    maxPlaytime: toInt(item.maxplaytime?.value),
    ...stats,
    isCooperative: links.isCooperative,
    isLegacy: links.isLegacy,
    isCampaign: links.isCampaign,
    is18xx: links.is18xx,
    designers: links.designers,
    publishers: links.publishers,
    artists: links.artists,
    families: links.families,
    categories: links.categories,
    mechanics: links.mechanics,
    expansionLinks: links.expansionLinks,
  };
}

/** Map a parsed /search item to a BggSearchResult, or null if it lacks an id. */
export function mapSearchItem(item: ParsedSearchItem): BggSearchResult | null {
  const bggId = toInt(item.id);
  if (bggId === null) return null;
  return {
    bggId,
    name: primaryName(item.name ?? []),
    yearPublished: toInt(item.yearpublished?.value),
    type: itemType(item.type),
  };
}
