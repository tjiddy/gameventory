import type { GameStore } from '../services/game-store.js';

// Migration of prod Mongo → the new relational schema (MIGRATION-PLAN §11). Only
// USER STATE is carried over (owned/played/createTime/tagline); all BGG metadata is
// re-hydrated afterward, so chimera metadata damage (ledger B) washes out.

export interface RawExpansion {
  bgg_id: number;
  owned?: boolean | undefined;
  played?: boolean | undefined;
  name?: string | undefined;
}
export interface RawGameDoc {
  bgg_id: number;
  name?: string | undefined;
  owned?: boolean | undefined;
  played?: boolean | undefined;
  tagline: string | null;
  create_time: unknown;
  expansions: RawExpansion[];
}

const asBool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const asStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const asInt = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined;

/** Defensively extract a game doc from a raw mongoexport object (or null if unusable). */
export function coerceDoc(raw: unknown): RawGameDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const bggId = asInt(o['bgg_id']);
  if (bggId === undefined) return null;

  const expansions: RawExpansion[] = [];
  for (const e of Array.isArray(o['expansions']) ? o['expansions'] : []) {
    if (!e || typeof e !== 'object') continue;
    const eo = e as Record<string, unknown>;
    const ebid = asInt(eo['bgg_id']);
    if (ebid === undefined) continue;
    expansions.push({ bgg_id: ebid, owned: asBool(eo['owned']), played: asBool(eo['played']), name: asStr(eo['name']) });
  }

  return {
    bgg_id: bggId,
    name: asStr(o['name']),
    owned: asBool(o['owned']),
    played: asBool(o['played']),
    tagline: asStr(o['tagline']) ?? null,
    create_time: o['create_time'],
    expansions,
  };
}

export function coerceDocs(raw: unknown[]): RawGameDoc[] {
  return raw.map(coerceDoc).filter((d): d is RawGameDoc => d !== null);
}

/** Tolerant create_time parse: ISO string, epoch number, or {$date} extended JSON. */
export function parseCreateTime(value: unknown): Date | null {
  const d = toDate(value);
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') return new Date(value);
  if (typeof value === 'object') {
    const dv = (value as Record<string, unknown>)['$date'];
    if (typeof dv === 'string') return new Date(dv);
    if (typeof dv === 'number') return new Date(dv);
    if (dv && typeof dv === 'object') {
      const nl = (dv as Record<string, unknown>)['$numberLong'];
      if (typeof nl === 'string') return new Date(Number(nl));
    }
  }
  return null;
}

export interface ScanReport {
  topLevelCount: number;
  duplicateBggIds: number[]; // among top-level docs → ABORT
  typeConflicts: number[]; // bgg_id both top-level and embedded → top-level wins
  chimeraDocs: number[]; // top-level docs with no name (ledger B corruption signal)
  createTimeUnparseable: number[]; // fell back to now
  abort: boolean;
}

export function scanExport(docs: RawGameDoc[]): ScanReport {
  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const d of docs) {
    if (seen.has(d.bgg_id)) dupes.add(d.bgg_id);
    seen.add(d.bgg_id);
  }
  const embedded = new Set<number>();
  for (const d of docs) for (const e of d.expansions) embedded.add(e.bgg_id);

  return {
    topLevelCount: docs.length,
    duplicateBggIds: [...dupes],
    typeConflicts: [...embedded].filter((id) => seen.has(id)),
    chimeraDocs: docs.filter((d) => !d.name || d.name.trim() === '').map((d) => d.bgg_id),
    createTimeUnparseable: docs
      .filter((d) => d.create_time !== null && d.create_time !== undefined && parseCreateTime(d.create_time) === null)
      .map((d) => d.bgg_id),
    abort: dupes.size > 0,
  };
}

export interface SeedPlanBase {
  bggId: number;
  name: string;
  owned: boolean;
  played: boolean;
  createTime: Date;
  tagline: string | null;
}
export interface SeedPlanExpansion {
  bggId: number;
  name: string;
  owned: boolean;
  played: boolean;
  parents: number[]; // base bgg_ids
}
export interface SeedPlan {
  bases: SeedPlanBase[];
  expansions: SeedPlanExpansion[];
  mergeConflicts: number[]; // expansion bgg_ids whose copies disagreed on owned/played
}

interface ExpAccumulator {
  name?: string | undefined;
  owned: boolean;
  played: boolean;
  parents: Set<number>;
  ownedVals: Set<boolean>;
  playedVals: Set<boolean>;
}

/** Group embedded expansions across parents (OR-merge owned/played); top-level wins on conflict. */
function collectExpansions(docs: RawGameDoc[], topLevel: Set<number>): Map<number, ExpAccumulator> {
  const map = new Map<number, ExpAccumulator>();
  for (const doc of docs) {
    for (const e of doc.expansions) {
      if (topLevel.has(e.bgg_id)) continue; // type conflict → the top-level base wins
      let entry = map.get(e.bgg_id);
      if (!entry) {
        entry = { owned: false, played: false, parents: new Set(), ownedVals: new Set(), playedVals: new Set() };
        map.set(e.bgg_id, entry);
      }
      entry.owned = entry.owned || (e.owned ?? false);
      entry.played = entry.played || (e.played ?? false);
      entry.ownedVals.add(e.owned ?? false);
      entry.playedVals.add(e.played ?? false);
      entry.parents.add(doc.bgg_id);
      if (!entry.name && e.name) entry.name = e.name;
    }
  }
  return map;
}

export function buildSeedPlan(docs: RawGameDoc[], now: Date): SeedPlan {
  const topLevel = new Set(docs.map((d) => d.bgg_id));
  const bases: SeedPlanBase[] = docs.map((d) => ({
    bggId: d.bgg_id,
    name: d.name?.trim() || `Game ${d.bgg_id}`,
    owned: d.owned ?? true,
    played: d.played ?? false,
    createTime: parseCreateTime(d.create_time) ?? now,
    tagline: d.tagline || null,
  }));

  const expMap = collectExpansions(docs, topLevel);
  const expansions: SeedPlanExpansion[] = [];
  const mergeConflicts: number[] = [];
  for (const [bggId, e] of expMap) {
    if (e.ownedVals.size > 1 || e.playedVals.size > 1) mergeConflicts.push(bggId);
    expansions.push({ bggId, name: e.name?.trim() || `Expansion ${bggId}`, owned: e.owned, played: e.played, parents: [...e.parents] });
  }
  return { bases, expansions, mergeConflicts };
}

/** Insert base + expansion rows and junctions from a seed plan (hydrated=false). */
export async function seedFromPlan(
  store: GameStore,
  plan: SeedPlan,
  now: Date,
): Promise<{ baseCount: number; expansionCount: number }> {
  const baseIdByBgg = new Map<number, number>();
  for (const b of plan.bases) {
    const row = await store.insertGame({
      bggId: b.bggId, type: 'base', owned: b.owned, played: b.played,
      createTime: b.createTime, name: b.name, tagline: b.tagline, updateTime: now,
    });
    baseIdByBgg.set(b.bggId, row.id);
  }
  for (const e of plan.expansions) {
    const row = await store.insertGame({
      bggId: e.bggId, type: 'expansion', owned: e.owned, played: e.played,
      createTime: now, name: e.name, updateTime: now,
    });
    for (const parentBgg of e.parents) {
      const baseId = baseIdByBgg.get(parentBgg);
      if (baseId !== undefined) await store.linkExpansion(baseId, row.id);
    }
  }
  return { baseCount: plan.bases.length, expansionCount: plan.expansions.length };
}
