import type { GameSummary } from '../../shared/schemas/index.js';
import type { TagFilter } from '../lib/library-filters';

const MECHANISM_PREFIX = 'Mechanism: ';

/**
 * Build the click-to-filter tags for a game card: first publisher, first designer,
 * every mechanic, and any "Mechanism: X" family (label stripped for display, but the
 * filter carries the FULL family string so a tag click matches the library filter).
 */
export function buildCardTags(game: GameSummary): { label: string; tag: TagFilter }[] {
  const tags: { label: string; tag: TagFilter }[] = [];
  const publisher = game.publishers[0];
  if (publisher) tags.push({ label: publisher, tag: { type: 'Publisher', name: publisher } });
  const designer = game.designers[0];
  if (designer) tags.push({ label: designer, tag: { type: 'Designer', name: designer } });
  for (const mechanic of game.mechanics) tags.push({ label: mechanic, tag: { type: 'Mechanic', name: mechanic } });
  for (const family of game.families) {
    if (family.startsWith(MECHANISM_PREFIX)) {
      tags.push({ label: family.slice(MECHANISM_PREFIX.length), tag: { type: 'Family', name: family } });
    }
  }
  return tags;
}
