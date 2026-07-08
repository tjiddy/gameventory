import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExpansionSummary } from '../../shared/schemas/index.js';
import { ExpansionsSection } from './ExpansionsSection';

afterEach(cleanup);

function expansion(over: Partial<ExpansionSummary> = {}): ExpansionSummary {
  return {
    bggId: 99,
    name: 'Seafarers',
    yearPublished: 1997,
    image: 'https://example.com/exp.png',
    description: null,
    ratingAvg: 7.0,
    weightAvg: 2.3,
    owned: true,
    played: false,
    hydrated: true,
    ...over,
  };
}

describe('ExpansionsSection thumbnail crop anchor', () => {
  it('anchors every thumbnail crop to the top (bg-top, not bg-center) and preserves grayscale only on unowned expansions', () => {
    const { container } = render(
      <ExpansionsSection
        expansions={[
          expansion({ bggId: 1, name: 'Owned Exp', owned: true }),
          expansion({ bggId: 2, name: 'Unowned Exp', owned: false }),
        ]}
        onOpen={() => {}}
      />,
    );

    const thumbs = container.querySelectorAll('div.bg-cover');
    expect(thumbs.length).toBe(2);
    for (const thumb of thumbs) {
      expect(thumb.className).toContain('bg-top');
      expect(thumb.className).not.toContain('bg-center');
    }

    // First thumb = owned (no grayscale); second = unowned (grayscale retained).
    expect(thumbs[0]!.className).not.toContain('grayscale');
    expect(thumbs[1]!.className).toContain('grayscale');
  });
});
