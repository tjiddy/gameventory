import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGames } from '../hooks/queries';
import {
  filterAndSort,
  filtersToParams,
  parseFiltersFromParams,
  DEFAULT_FILTERS,
  type LibraryFilters,
  type TagFilter,
} from '../lib/library-filters';
import { GameCard } from '../components/GameCard';
import { LibraryControls } from '../components/LibraryControls';
import { Tag } from '../components/Tag';
import { Spinner } from '../components/Spinner';

const GRID =
  'grid grid-cols-1 c2:grid-cols-2 c3:grid-cols-3 c4:grid-cols-4 c5:grid-cols-5 c6:grid-cols-6 c7:grid-cols-7 c8:grid-cols-8 gap-4';

export function LibraryPage() {
  const { data: games, isLoading, isError } = useGames();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<LibraryFilters>(() => ({
    ...DEFAULT_FILTERS,
    ...parseFiltersFromParams(searchParams),
  }));

  const update = (patch: Partial<LibraryFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setSearchParams(filtersToParams(next), { replace: true });
  };

  const addTag = (tag: TagFilter) => {
    if (filters.tags.some((t) => t.name === tag.name)) return;
    setFilters((f) => ({ ...f, tags: [...f.tags, tag] }));
  };
  const removeTag = (tag: TagFilter) =>
    setFilters((f) => ({ ...f, tags: f.tags.filter((t) => t.name !== tag.name) }));

  if (isLoading) return <Spinner label="Loading library…" />;
  if (isError || !games) return <p className="p-8 text-center text-red-400">Failed to load games.</p>;

  const shown = filterAndSort(games, filters);

  return (
    <div className="flex flex-col gap-4 p-4">
      <LibraryControls filters={filters} onChange={update} />

      {filters.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.tags.map((t) => (
            <Tag key={`${t.type}-${t.name}`} label={`${t.type} - ${t.name}`} onRemove={() => removeTag(t)} />
          ))}
        </div>
      )}

      <p className="text-sm text-gray-400">
        Showing {shown.length} of {games.length} games
      </p>

      {shown.length === 0 ? (
        <p className="p-8 text-center text-gray-400">No games found.</p>
      ) : (
        <div className={GRID}>
          {shown.map((game, i) => (
            <GameCard key={game.bggId} game={game} index={i + 1} onTagClick={addTag} />
          ))}
        </div>
      )}
    </div>
  );
}
