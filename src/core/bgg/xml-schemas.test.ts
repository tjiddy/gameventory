import { describe, it, expect } from 'vitest';
import { ThingResponse, SearchResponse } from './xml-schemas.js';

describe('ThingResponse (lenient parse of fast-xml-parser output)', () => {
  it('coerces a childless <items/> ("") to an empty item set instead of throwing', () => {
    const parsed = ThingResponse.parse({ items: '' });
    expect(parsed.items?.item).toBeUndefined();
  });

  it('parses an item array and strips unknown keys', () => {
    const parsed = ThingResponse.parse({
      items: { item: [{ id: '1', name: [{ type: 'primary', value: 'X' }], junk: 'drop' }] },
      extra: 9,
    });
    expect(parsed.items?.item?.[0]?.id).toBe('1');
    expect(parsed.items?.item?.[0]).not.toHaveProperty('junk');
    expect(parsed).not.toHaveProperty('extra');
  });
});

describe('SearchResponse', () => {
  it('coerces a childless <items/> to an empty set', () => {
    expect(SearchResponse.parse({ items: '' }).items?.item).toBeUndefined();
  });
});
