export const fmt2 = (n: number | null): string => (n === null ? '—' : n.toFixed(2));
export const fmtInt = (n: number | null): string => (n === null ? '—' : n.toLocaleString());

export function fmtPlayers(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—';
  if (min !== null && max !== null) return min === max ? `${min}` : `${min}–${max}`;
  return String(min ?? max);
}

export function fmtPlaytime(playtime: number | null, min: number | null, max: number | null): string {
  if (playtime === null) return '—';
  if (min !== null && max !== null && min !== max) return `${playtime} min (${min}–${max})`;
  return `${playtime} min`;
}

export const fmtDate = (ms: number): string => new Date(ms).toLocaleDateString();
export const fmtDateTime = (ms: number): string => new Date(ms).toLocaleString();

/** Decode HTML entities in text sourced from BGG (descriptions, taglines) for plain rendering. */
export function decodeHtml(s: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
}
