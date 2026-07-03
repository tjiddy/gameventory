import { XMLParser } from 'fast-xml-parser';
import { ThingResponse, SearchResponse } from './xml-schemas.js';
import { mapThingItem, mapSearchItem, decodeEntities } from './mapping.js';
import { BggRequestQueue, realSleep, type SleepFn } from './queue.js';
import { BggRequestError } from './errors.js';
import type { BggThing, BggSearchResult, BggThingsResult, BggPort } from './types.js';

const API_BASE = 'https://boardgamegeek.com/xmlapi2';
const WEBSITE_BASE = 'https://boardgamegeek.com';
const THING_BATCH_SIZE = 20;

// fast-xml-parser config: attributes as bare keys, and item/name/link/rank ALWAYS
// arrays so single-result responses need no special-casing. Values stay strings —
// mapping.ts controls int/float coercion and null handling.
function buildParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: 'text',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
    processEntities: true,
    // Force these ELEMENTS to arrays (never attributes — isArray fires for both,
    // and a `name`/`type` attribute must stay a scalar).
    isArray: (name, _jpath, _isLeaf, isAttribute) =>
      !isAttribute && (name === 'item' || name === 'name' || name === 'link' || name === 'rank'),
  });
}

export interface BggAdapterOptions {
  queue?: BggRequestQueue;
  sleep?: SleepFn;
  /** Total attempts per request before giving up (includes the first try). */
  maxAttempts?: number;
  /** Base backoff (ms) for the 202/429 retry — doubles each attempt. */
  backoffBaseMs?: number;
  /** Injectable for tests; defaults to the global fetch (undici, TLS on). */
  fetchFn?: typeof fetch;
  /** BGG XML API bearer token — required by BGG since Oct 2025 (401 without it). */
  token?: string | undefined;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * The single gateway to BoardGameGeek (MIGRATION-PLAN §7). TLS verification is ON
 * (global fetch); nothing else in the app calls BGG directly. The adapter never
 * logs and never touches the DB — it returns data or throws typed errors.
 */
export class BggAdapter implements BggPort {
  private readonly parser = buildParser();
  private readonly queue: BggRequestQueue;
  private readonly sleep: SleepFn;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly token: string | undefined;

  constructor(opts: BggAdapterOptions = {}) {
    this.queue = opts.queue ?? new BggRequestQueue();
    this.sleep = opts.sleep ?? realSleep;
    this.maxAttempts = opts.maxAttempts ?? 4;
    this.backoffBaseMs = opts.backoffBaseMs ?? 2000;
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
    this.token = opts.token;
  }

  private async rawRequest(url: string, accept: string): Promise<{ status: number; text: string }> {
    const headers: Record<string, string> = { accept };
    // BGG requires a bearer token on the XML API since Oct 2025 (401 without it).
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const res = await this.fetchFn(url, { headers });
    const text = await res.text();
    return { status: res.status, text };
  }

  /**
   * Fetch XML through the serial queue, retrying on 202 (BGG "queued") and 429
   * with exponential backoff. Any other non-200, or exhausted retries, throws.
   */
  private async fetchXml(url: string): Promise<string> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const { status, text } = await this.queue.enqueue(() => this.rawRequest(url, 'application/xml'));
      if (status === 200) return text;
      if ((status === 202 || status === 429) && attempt < this.maxAttempts) {
        await this.sleep(this.backoffBaseMs * 2 ** (attempt - 1));
        continue;
      }
      throw new BggRequestError(url, status);
    }
    throw new BggRequestError(url, 0);
  }

  /** Name search (base games only — expansions are added by id). */
  async search(query: string): Promise<BggSearchResult[]> {
    const url = `${API_BASE}/search?query=${encodeURIComponent(query)}&type=boardgame`;
    const xml = await this.fetchXml(url);
    const parsed = SearchResponse.parse(this.parser.parse(xml));
    const items = parsed.items?.item ?? [];
    return items.map(mapSearchItem).filter((r): r is BggSearchResult => r !== null);
  }

  /**
   * Batched /thing fetch (chunks of 20). NO `type` param — BGG silently omits
   * non-matching ids when type is set (MIGRATION-PLAN §7.3); type is derived from
   * each item. Requested ids absent from the response are per-id failures.
   */
  async getThings(bggIds: number[]): Promise<BggThingsResult> {
    const things: BggThing[] = [];
    const missing: number[] = [];

    for (const ids of chunk(bggIds, THING_BATCH_SIZE)) {
      const url = `${API_BASE}/thing?id=${ids.join(',')}&stats=1`;
      const xml = await this.fetchXml(url);
      const parsed = ThingResponse.parse(this.parser.parse(xml));
      const byId = new Map<number, BggThing>();
      for (const item of parsed.items?.item ?? []) {
        const thing = mapThingItem(item);
        if (thing) byId.set(thing.bggId, thing);
      }
      for (const id of ids) {
        const thing = byId.get(id);
        if (thing) things.push(thing);
        else missing.push(id);
      }
    }

    return { things, missing };
  }

  /**
   * Scrape the game's HTML page for its tagline (BGG's XML API omits it). Fully
   * isolated: ANY failure returns null and never propagates to the caller
   * (MIGRATION-PLAN §7.5). Called only from add-flow and single-game refresh.
   */
  async scrapeTagline(bggId: number): Promise<string | null> {
    try {
      const url = `${WEBSITE_BASE}/boardgame/${bggId}`;
      const { status, text } = await this.queue.enqueue(() => this.rawRequest(url, 'text/html'));
      if (status !== 200) return null;
      const match = /<meta name="description" content="(.+?)">/.exec(text);
      return match?.[1] ? decodeEntities(match[1]) : null;
    } catch {
      return null;
    }
  }
}
