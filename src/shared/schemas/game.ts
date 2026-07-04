import { z } from 'zod';

// API contract schemas (§6). Timestamps serialize as epoch millis
// (numbers) — easiest for the client's date sorts. Metadata arrays are always
// arrays in the DTO (the mapper coalesces a null column to []).

export const GameSummary = z.object({
  bggId: z.number().int(),
  name: z.string(),
  image: z.string().nullable(),
  tagline: z.string().nullable(),
  yearPublished: z.number().int().nullable(),
  minPlayers: z.number().int().nullable(),
  maxPlayers: z.number().int().nullable(),
  playtime: z.number().int().nullable(),
  ratingAvg: z.number().nullable(),
  ratingBavg: z.number().nullable(),
  ratingVotes: z.number().int().nullable(),
  weightAvg: z.number().nullable(),
  isCooperative: z.boolean(),
  isLegacy: z.boolean(),
  isCampaign: z.boolean(),
  is18xx: z.boolean(),
  designers: z.array(z.string()),
  publishers: z.array(z.string()),
  artists: z.array(z.string()),
  families: z.array(z.string()),
  categories: z.array(z.string()),
  mechanics: z.array(z.string()),
  owned: z.boolean(),
  played: z.boolean(),
  createTime: z.number(),
  updateTime: z.number(),
});
export type GameSummary = z.infer<typeof GameSummary>;

export const ExpansionSummary = z.object({
  bggId: z.number().int(),
  name: z.string(),
  yearPublished: z.number().int().nullable(),
  image: z.string().nullable(),
  description: z.string().nullable(),
  ratingAvg: z.number().nullable(),
  weightAvg: z.number().nullable(),
  owned: z.boolean(),
  played: z.boolean(),
  hydrated: z.boolean(),
});
export type ExpansionSummary = z.infer<typeof ExpansionSummary>;

export const GameDetail = GameSummary.extend({
  description: z.string().nullable(),
  bggUrl: z.string().nullable(),
  thumbnail: z.string().nullable(),
  ratingStdev: z.number().nullable(),
  weightVotes: z.number().int().nullable(),
  rank: z.number().int().nullable(),
  minPlaytime: z.number().int().nullable(),
  maxPlaytime: z.number().int().nullable(),
  type: z.enum(['base', 'expansion']),
  hydrated: z.boolean(),
  expansions: z.array(ExpansionSummary),
});
export type GameDetail = z.infer<typeof GameDetail>;

export const GameListResponse = z.array(GameSummary);

/** POST /api/games body. */
export const AddGameBody = z.object({ bggId: z.number().int().positive() }).strict();
export type AddGameBody = z.infer<typeof AddGameBody>;

/** PATCH /api/games/:bggId body — user state only, no other keys. */
export const PatchGameBody = z
  .object({ played: z.boolean().optional(), owned: z.boolean().optional() })
  .strict();
export type PatchGameBody = z.infer<typeof PatchGameBody>;

/** :bggId path param (coerced from the URL string). */
export const BggIdParam = z.object({ bggId: z.coerce.number().int().positive() });
