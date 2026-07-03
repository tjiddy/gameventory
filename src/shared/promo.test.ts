import { describe, it, expect } from 'vitest';
import { isPromo, PROMO_REGEX } from './promo.js';

describe('isPromo (canonical promo regex)', () => {
  it('matches "Promo" and "promos" case-insensitively', () => {
    expect(isPromo('Catan: The Big Promo')).toBe(true);
    expect(isPromo('Assorted promos')).toBe(true);
    expect(isPromo('PROMO Pack')).toBe(true);
  });

  it('does not match "Promotional" (word-boundary after promo/promos)', () => {
    expect(isPromo('Promotional Materials')).toBe(false);
  });

  it('matches on the description when the name does not', () => {
    expect(isPromo('Bonus Tiles', 'A promo distributed at Gen Con')).toBe(true);
  });

  it('returns false for unrelated names and null/undefined inputs', () => {
    expect(isPromo('Seafarers Expansion')).toBe(false);
    expect(isPromo(null)).toBe(false);
    expect(isPromo(undefined, null)).toBe(false);
  });

  it('anchors on a word boundary, not a substring', () => {
    // "promotion" should NOT match: promo + optional s + \b fails mid-word.
    expect(PROMO_REGEX.test('promotion')).toBe(false);
    expect(PROMO_REGEX.test('promo')).toBe(true);
  });
});
