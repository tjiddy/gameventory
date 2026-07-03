import { useState } from 'react';
import {
  SORT_OPTIONS,
  defaultDirection,
  type LibraryFilters,
  type SortKey,
  type GameType,
  type PlayerCount,
  type PlayedFilter,
} from '../lib/library-filters';

const PLAYED: { value: PlayedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'played', label: 'Played' },
  { value: 'not_played', label: 'Not Played' },
];
const GAME_TYPES: { value: GameType; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: '18xx', label: '18XX' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'cooperative', label: 'Cooperative' },
  { value: 'legacy', label: 'Legacy' },
];
const PLAYERS: PlayerCount[] = ['all', '1', '2', '3', '4', '5', '6', '7+'];

const selectClass = 'rounded bg-gray-800 px-2 py-1 text-sm';

interface Props {
  filters: LibraryFilters;
  onChange: (patch: Partial<LibraryFilters>) => void;
}

export function LibraryControls({ filters, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const chooseSort = (key: SortKey) =>
    key === filters.sortBy
      ? onChange({ sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc' })
      : onChange({ sortBy: key, sortDirection: defaultDirection(key) });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-2 rounded bg-gray-800 px-3 py-1 text-sm md:hidden"
      >
        {open ? 'Hide Filters' : 'Filters'}
      </button>

      <div className={`${open ? 'flex' : 'hidden'} flex-col gap-3 md:flex md:flex-row md:flex-wrap md:items-end`}>
        <fieldset className="flex items-center gap-3 text-sm">
          {PLAYED.map((p) => (
            <label key={p.value} className="flex items-center gap-1">
              <input
                type="radio"
                name="played"
                checked={filters.playedFilter === p.value}
                onChange={() => onChange({ playedFilter: p.value })}
              />
              {p.label}
            </label>
          ))}
        </fieldset>

        <select className={selectClass} value={filters.gameType} onChange={(e) => onChange({ gameType: e.target.value as GameType })}>
          {GAME_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <select className={selectClass} value={filters.playerCount} onChange={(e) => onChange({ playerCount: e.target.value as PlayerCount })}>
          {PLAYERS.map((p) => (
            <option key={p} value={p}>{p === 'all' ? 'All Players' : `${p} Players`}</option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <select className={selectClass} value={filters.sortBy} onChange={(e) => chooseSort(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Toggle sort direction"
            onClick={() => onChange({ sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc' })}
            className="rounded bg-gray-800 px-2 py-1 text-sm"
          >
            {filters.sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Filter by name…"
            value={filters.text}
            onChange={(e) => onChange({ text: e.target.value })}
            className="rounded bg-gray-800 px-2 py-1 text-sm"
          />
          {filters.text && (
            <button type="button" aria-label="Clear text filter" onClick={() => onChange({ text: '' })} className="absolute right-1 top-1 text-gray-400">
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
