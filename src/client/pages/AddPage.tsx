import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { BggSearchResultDto } from '../../shared/schemas/index.js';
import { useSearch, useAddGame } from '../hooks/mutations';
import { fmt2, fmtPlayers } from '../lib/format';
import { Spinner } from '../components/Spinner';

function ResultRow({ r, onAdd }: { r: BggSearchResultDto; onAdd: (r: BggSearchResultDto) => void }) {
  return (
    <button
      type="button"
      disabled={r.inLibrary}
      onClick={() => onAdd(r)}
      className={`flex w-full items-center gap-3 rounded-lg bg-gray-800 p-2 text-left ${
        r.inLibrary ? 'cursor-not-allowed opacity-50 grayscale' : 'hover:bg-gray-700'
      }`}
    >
      <div
        className="h-16 w-16 shrink-0 rounded bg-gray-700 bg-cover bg-center"
        style={r.image ? { backgroundImage: `url("${r.image}")` } : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{r.name}</span>
          {r.yearPublished && <span className="rounded bg-gray-700 px-1 text-xs text-gray-300">{r.yearPublished}</span>}
          {r.inLibrary && <span className="text-xs text-cyan-400">in library</span>}
        </div>
        <p className="truncate text-xs text-gray-400">
          ★{fmt2(r.ratingAvg)} · {r.publishers[0] ?? '—'} · {fmtPlayers(r.minPlayers, r.maxPlayers)} Players ·{' '}
          {r.playtime ?? '—'} min{r.families.length ? ` · ${r.families.join(', ')}` : ''}
        </p>
      </div>
    </button>
  );
}

export function AddPage() {
  const [query, setQuery] = useState('');
  const search = useSearch();
  const add = useAddGame();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) search.mutate(q);
  };

  const onAdd = (r: BggSearchResultDto) =>
    add.mutate(r.bggId, {
      onSuccess: () => {
        toast.success(`Added ${r.name}`);
        setQuery('');
        search.reset();
      },
      onError: (e) => toast.error(e.message),
    });

  const results = search.data ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          required
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search BGG by name, or paste a BGG id…"
          className="flex-1 rounded bg-gray-800 px-3 py-2"
        />
        <button type="submit" className="rounded bg-cyan-600 px-4 py-2 font-medium hover:bg-cyan-500">Search</button>
        <button type="button" onClick={() => navigate('/')} className="rounded bg-gray-700 px-4 py-2 hover:bg-gray-600">Cancel</button>
      </form>

      {search.isPending && <Spinner label="Searching BGG…" />}
      {search.isError && <p className="text-red-400">Search failed: {search.error.message}</p>}
      {search.isSuccess && results.length === 0 && <p className="text-gray-400">No results.</p>}

      <div className="flex flex-col gap-2">
        {results.map((r) => (
          <ResultRow key={r.bggId} r={r} onAdd={onAdd} />
        ))}
      </div>
    </div>
  );
}
