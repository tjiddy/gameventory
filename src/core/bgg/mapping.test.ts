import { describe, it, expect } from 'vitest';
import { mapThingItem, mapSearchItem, decodeEntities } from './mapping.js';
import type { ParsedThingItem } from './xml-schemas.js';

const fullItem: ParsedThingItem = {
  type: 'boardgame',
  id: '13',
  thumbnail: 'thumb.jpg',
  image: 'image.jpg',
  description: 'A game',
  name: [
    { type: 'alternate', value: 'Alt' },
    { type: 'primary', value: 'Catan' },
  ],
  yearpublished: { value: '1995' },
  minplayers: { value: '3' },
  maxplayers: { value: '4' },
  playingtime: { value: '90' },
  minplaytime: { value: '45' },
  maxplaytime: { value: '120' },
  link: [
    { type: 'boardgamedesigner', id: '1', value: 'Klaus Teuber' },
    { type: 'boardgamepublisher', id: '2', value: 'Kosmos' },
    { type: 'boardgameartist', id: '3', value: 'Some Artist' },
    { type: 'boardgamecategory', id: '4', value: 'Negotiation' },
    { type: 'boardgamemechanic', id: '5', value: 'Cooperative Play' },
    { type: 'boardgamefamily', id: '6', value: 'Legacy: X' },
    { type: 'boardgameexpansion', id: '77', value: 'Seafarers' },
    { type: 'boardgameexpansion', id: 'bad', value: 'DroppedNoIntId' },
  ],
  statistics: {
    ratings: {
      average: { value: '7.1' },
      bayesaverage: { value: '6.9' },
      stddev: { value: '1.5' },
      usersrated: { value: '1234' },
      averageweight: { value: '2.3' },
      numweights: { value: '567' },
      ranks: {
        rank: [
          { type: 'subtype', name: 'boardgame', value: '42' },
          { type: 'family', name: 'strategygames', value: '10' },
        ],
      },
    },
  },
};

describe('mapThingItem', () => {
  it('maps every numeric field to its own source and picks the primary name (not the first)', () => {
    const t = mapThingItem(fullItem)!;
    expect(t.bggId).toBe(13);
    expect(t.name).toBe('Catan');
    expect(t.type).toBe('base');
    expect(t.yearPublished).toBe(1995);
    expect(t.minPlayers).toBe(3);
    expect(t.maxPlayers).toBe(4);
    expect(t.playtime).toBe(90);
    expect(t.minPlaytime).toBe(45);
    expect(t.maxPlaytime).toBe(120);
    expect(t.ratingAvg).toBe(7.1);
    expect(t.ratingBavg).toBe(6.9);
    expect(t.ratingStdev).toBe(1.5);
    expect(t.ratingVotes).toBe(1234);
    expect(t.weightAvg).toBe(2.3);
    expect(t.weightVotes).toBe(567);
    expect(t.rank).toBe(42); // subtype/boardgame rank, NOT the family rank (10)
    expect(t.bggUrl).toBe('https://boardgamegeek.com/boardgame/13');
  });

  it('collects each link family, derives flags, and drops expansion links with a non-int id', () => {
    const t = mapThingItem(fullItem)!;
    expect(t.designers).toEqual(['Klaus Teuber']);
    expect(t.publishers).toEqual(['Kosmos']);
    expect(t.artists).toEqual(['Some Artist']);
    expect(t.categories).toEqual(['Negotiation']);
    expect(t.mechanics).toEqual(['Cooperative Play']);
    expect(t.families).toEqual(['Legacy: X']);
    expect(t.isCooperative).toBe(true); // 'coop' in 'Cooperative Play'
    expect(t.isLegacy).toBe(true); // 'legacy' in family 'Legacy: X'
    expect(t.expansionLinks).toEqual([{ bggId: 77, name: 'Seafarers' }]);
  });

  it('maps type=boardgameexpansion to expansion', () => {
    expect(mapThingItem({ ...fullItem, type: 'boardgameexpansion' })!.type).toBe('expansion');
  });

  it('returns null when the id or a usable name is missing (per-id failure)', () => {
    expect(mapThingItem({ ...fullItem, id: undefined })).toBeNull();
    expect(mapThingItem({ ...fullItem, name: [] })).toBeNull();
  });

  it('falls back to the first name when none is tagged primary', () => {
    expect(mapThingItem({ ...fullItem, name: [{ type: 'alternate', value: 'OnlyOne' }] })!.name).toBe('OnlyOne');
  });

  it('yields all-null stats when statistics are absent', () => {
    const t = mapThingItem({ ...fullItem, statistics: undefined })!;
    expect(t.ratingAvg).toBeNull();
    expect(t.weightAvg).toBeNull();
    expect(t.rank).toBeNull();
  });
});

describe('mapSearchItem', () => {
  it('maps id/name/year/type and returns null without an id', () => {
    expect(
      mapSearchItem({ id: '9', name: [{ type: 'primary', value: 'Foo' }], yearpublished: { value: '2001' }, type: 'boardgameexpansion' }),
    ).toEqual({ bggId: 9, name: 'Foo', yearPublished: 2001, type: 'expansion' });
    expect(mapSearchItem({ name: [{ value: 'X' }] })).toBeNull();
  });
});

describe('decodeEntities', () => {
  it('decodes numeric, hex, and named entities, resolving &amp; LAST', () => {
    expect(decodeEntities('A &#66; C')).toBe('A B C');
    expect(decodeEntities('&#x41;')).toBe('A');
    expect(decodeEntities('Trade &amp; Build')).toBe('Trade & Build');
    expect(decodeEntities('&quot;Hi&quot; &ndash; ok')).toBe('"Hi" – ok');
    // &amp; is resolved after the named pass, so a double-encoded &amp;quot; stays a
    // literal &quot; rather than collapsing to a bare quote.
    expect(decodeEntities('&amp;quot;')).toBe('&quot;');
  });
});
