import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { BggAdapter, type BggAdapterOptions } from './adapter.js';
import { BggRequestQueue } from './queue.js';
import { BggRequestError } from './errors.js';
import {
  THING_MIXED_BATCH,
  THING_SINGLE,
  THING_18XX,
  THING_EMPTY,
  SEARCH_RESULTS,
  GAME_HTML_PAGE,
} from './__fixtures__/bgg-xml.js';

const THING_URL = 'https://boardgamegeek.com/xmlapi2/thing';
const SEARCH_URL = 'https://boardgamegeek.com/xmlapi2/search';
const PAGE_URL = 'https://boardgamegeek.com/boardgame/13';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function xml(body: string, status = 200) {
  return new HttpResponse(body, { status, headers: { 'Content-Type': 'application/xml' } });
}

// Instant adapter: zero queue spacing + no-op sleeps so tests never actually wait.
function makeAdapter(over: Partial<BggAdapterOptions> = {}): BggAdapter {
  return new BggAdapter({
    queue: new BggRequestQueue(0, async () => {}),
    sleep: async () => {},
    backoffBaseMs: 0,
    ...over,
  });
}

describe('BggAdapter.getThings', () => {
  it('maps a mixed base+expansion batch, derives type, reports missing ids, sends NO type param', async () => {
    let capturedUrl = '';
    server.use(http.get(THING_URL, ({ request }) => { capturedUrl = request.url; return xml(THING_MIXED_BATCH); }));

    const { things, missing } = await makeAdapter().getThings([13, 926, 99999]);

    expect(things).toHaveLength(2);
    expect(missing).toEqual([99999]);

    const catan = things.find((t) => t.bggId === 13)!;
    const seafarers = things.find((t) => t.bggId === 926)!;
    expect(catan.type).toBe('base');
    expect(seafarers.type).toBe('expansion');
    expect(catan.rank).toBe(392);
    expect(seafarers.rank).toBeNull(); // "Not Ranked"
    expect(catan.designers).toEqual(['Klaus Teuber', 'Benjamin Teuber']);
    expect(catan.publishers).toEqual(['KOSMOS']);
    expect(catan.isCooperative).toBe(true);
    expect(catan.isLegacy).toBe(true);
    expect(catan.isCampaign).toBe(true);
    expect(catan.is18xx).toBe(false);
    expect(catan.expansionLinks).toEqual([
      { bggId: 926, name: 'Catan: Seafarers' },
      { bggId: 927, name: 'Catan: Cities & Knights' },
    ]);

    // The trap (§7.3): /thing must carry the id list but never a type param.
    const params = new URL(capturedUrl).searchParams;
    expect(params.get('type')).toBeNull();
    expect(params.get('id')).toBe('13,926,99999');
    expect(params.get('stats')).toBe('1');
  });

  it('normalizes a single-item response into an array', async () => {
    server.use(http.get(THING_URL, () => xml(THING_SINGLE)));
    const { things } = await makeAdapter().getThings([13]);
    expect(things).toHaveLength(1);
    expect(things[0]!.name).toBe('Catan');
  });

  it('derives is18xx from families with other flags false', async () => {
    server.use(http.get(THING_URL, () => xml(THING_18XX)));
    const { things } = await makeAdapter().getThings([17226]);
    const g = things[0]!;
    expect(g.is18xx).toBe(true);
    expect(g.isCooperative).toBe(false);
    expect(g.isLegacy).toBe(false);
    expect(g.isCampaign).toBe(false);
  });

  it('reports all ids missing on an empty response', async () => {
    server.use(http.get(THING_URL, () => xml(THING_EMPTY)));
    const { things, missing } = await makeAdapter().getThings([99999]);
    expect(things).toHaveLength(0);
    expect(missing).toEqual([99999]);
  });

  it('retries on 202 then succeeds, applying backoff', async () => {
    let calls = 0;
    server.use(http.get(THING_URL, () => { calls += 1; return calls === 1 ? xml('<items/>', 202) : xml(THING_SINGLE); }));
    const sleep = vi.fn(async () => {});
    const { things } = await makeAdapter({ sleep }).getThings([13]);
    expect(things).toHaveLength(1);
    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('throws BggRequestError after exhausting retries on 429', async () => {
    server.use(http.get(THING_URL, () => xml('<items/>', 429)));
    await expect(makeAdapter({ maxAttempts: 2 }).getThings([13])).rejects.toBeInstanceOf(BggRequestError);
  });

  it('batches ids into chunks of 20', async () => {
    const capturedIds: string[] = [];
    server.use(http.get(THING_URL, ({ request }) => {
      capturedIds.push(new URL(request.url).searchParams.get('id')!);
      return xml(THING_EMPTY);
    }));
    const ids = Array.from({ length: 45 }, (_, i) => i + 1);
    await makeAdapter().getThings(ids);
    expect(capturedIds).toHaveLength(3);
    expect(capturedIds[0]!.split(',')).toHaveLength(20);
    expect(capturedIds[2]!.split(',')).toHaveLength(5);
  });
});

describe('BggAdapter.search', () => {
  it('returns bare results in BGG order and passes type=boardgame', async () => {
    let capturedUrl = '';
    server.use(http.get(SEARCH_URL, ({ request }) => { capturedUrl = request.url; return xml(SEARCH_RESULTS); }));
    const results = await makeAdapter().search('catan');
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ bggId: 13, name: 'Catan', yearPublished: 1995, type: 'base' });
    const params = new URL(capturedUrl).searchParams;
    expect(params.get('query')).toBe('catan');
    expect(params.get('type')).toBe('boardgame');
  });
});

describe('BggAdapter.scrapeTagline', () => {
  it('extracts and HTML-decodes the meta description', async () => {
    server.use(http.get(PAGE_URL, () => new HttpResponse(GAME_HTML_PAGE, { status: 200, headers: { 'Content-Type': 'text/html' } })));
    const tagline = await makeAdapter().scrapeTagline(13);
    expect(tagline).toBe('Catan is the classic trading & building game for 3–4 players.');
  });

  it('returns null (never throws) on a non-200', async () => {
    server.use(http.get(PAGE_URL, () => new HttpResponse('nope', { status: 500 })));
    await expect(makeAdapter().scrapeTagline(13)).resolves.toBeNull();
  });

  it('returns null when the request itself throws', async () => {
    server.use(http.get(PAGE_URL, () => HttpResponse.error()));
    await expect(makeAdapter().scrapeTagline(13)).resolves.toBeNull();
  });
});
