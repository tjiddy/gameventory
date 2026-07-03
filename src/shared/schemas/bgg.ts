import { z } from 'zod';

/** GET /api/bgg/search query. */
export const SearchQuery = z.object({ q: z.string().min(1) });

/** A rich search result row (server batch-hydrates the top results — §3.4/§6). */
export const BggSearchResultDto = z.object({
  bggId: z.number().int(),
  name: z.string(),
  yearPublished: z.number().int().nullable(),
  image: z.string().nullable(),
  ratingAvg: z.number().nullable(),
  publishers: z.array(z.string()),
  minPlayers: z.number().int().nullable(),
  maxPlayers: z.number().int().nullable(),
  playtime: z.number().int().nullable(),
  families: z.array(z.string()),
  type: z.enum(['base', 'expansion']),
  inLibrary: z.boolean(),
});
export type BggSearchResultDto = z.infer<typeof BggSearchResultDto>;

export const BggSearchResponse = z.array(BggSearchResultDto);
