import { z } from 'zod';

// Zod shapes for the fast-xml-parser output of the BGG XML API. The parser is
// configured (adapter.ts) with attributeNamePrefix '' and forces item/name/link/
// rank to arrays, so single-result responses need no special-casing here.
//
// Everything is optional and lenient: BGG omits fields freely, and z.object()
// strips unknown keys by default — we only read what we name.

const ValueAttr = z.object({ value: z.string().optional() });

const NameEl = z.object({
  type: z.string().optional(),
  value: z.string().optional(),
});

const LinkEl = z.object({
  type: z.string().optional(),
  id: z.string().optional(),
  value: z.string().optional(),
});

const RankEl = z.object({
  type: z.string().optional(),
  name: z.string().optional(),
  value: z.string().optional(),
});

const RatingsEl = z.object({
  average: ValueAttr.optional(),
  bayesaverage: ValueAttr.optional(),
  usersrated: ValueAttr.optional(),
  stddev: ValueAttr.optional(),
  averageweight: ValueAttr.optional(),
  numweights: ValueAttr.optional(),
  ranks: z.object({ rank: z.array(RankEl).optional() }).optional(),
});

const StatisticsEl = z.object({
  ratings: RatingsEl.optional(),
});

export const ThingItem = z.object({
  type: z.string().optional(),
  id: z.string().optional(),
  thumbnail: z.string().optional(),
  image: z.string().optional(),
  description: z.string().optional(),
  name: z.array(NameEl).optional(),
  yearpublished: ValueAttr.optional(),
  minplayers: ValueAttr.optional(),
  maxplayers: ValueAttr.optional(),
  playingtime: ValueAttr.optional(),
  minplaytime: ValueAttr.optional(),
  maxplaytime: ValueAttr.optional(),
  link: z.array(LinkEl).optional(),
  statistics: StatisticsEl.optional(),
});

// A childless <items/> parses to '' rather than an object; coerce non-objects to
// {} so an empty response yields "no items" instead of a schema failure.
const toObject = (v: unknown): unknown => (v && typeof v === 'object' ? v : {});

export const ThingResponse = z.object({
  items: z.preprocess(toObject, z.object({ item: z.array(ThingItem).optional() })).optional(),
});

const SearchItem = z.object({
  type: z.string().optional(),
  id: z.string().optional(),
  name: z.array(NameEl).optional(),
  yearpublished: ValueAttr.optional(),
});

export const SearchResponse = z.object({
  items: z.preprocess(toObject, z.object({ item: z.array(SearchItem).optional() })).optional(),
});

export type ParsedThingItem = z.infer<typeof ThingItem>;
export type ParsedSearchItem = z.infer<typeof SearchItem>;
