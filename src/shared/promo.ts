// Canonical promo detection (ledger H). The old app had TWO
// divergent regexes — one for filtering, a case-sensitive one for toggle
// visibility. This is the single source of truth, tested against name AND
// description, used by both the "hide promos" default and the toggle.
export const PROMO_REGEX = /promos?\b/i;

export function isPromo(name: string | null | undefined, description?: string | null): boolean {
  return PROMO_REGEX.test(name ?? '') || PROMO_REGEX.test(description ?? '');
}
