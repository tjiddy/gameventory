import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { GameDetail } from '../../shared/schemas/index.js';
import { useGame, useAuth } from '../hooks/queries';
import { usePatchGame, useDeleteGame, useRefreshGame } from '../hooks/mutations';
import { DetailPanel } from '../components/DetailPanel';
import { ExpansionsSection } from '../components/ExpansionsSection';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Spinner } from '../components/Spinner';
import { fmtDateTime, decodeHtml } from '../lib/format';

interface View {
  id: number;
  base?: { id: number; name: string };
}

const btn = 'rounded px-3 py-1.5 text-sm font-medium';

function Actions({
  game,
  onTogglePlayed,
  onToggleOwned,
  onDelete,
  onRefresh,
}: {
  game: GameDetail;
  onTogglePlayed: () => void;
  onToggleOwned: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const isBase = game.type === 'base';
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {game.owned && (
        <button type="button" onClick={onTogglePlayed} className={`${btn} bg-gray-700 hover:bg-gray-600`}>
          {game.played ? 'Mark as Unplayed' : 'Mark as Played'}
        </button>
      )}
      {!isBase && (
        <button type="button" onClick={onToggleOwned} className={`${btn} bg-cyan-600 hover:bg-cyan-500`}>
          {game.owned ? 'Mark as Unowned' : 'Mark as Owned'}
        </button>
      )}
      {isBase && (
        <>
          <button type="button" onClick={onRefresh} className={`${btn} bg-gray-700 hover:bg-gray-600`}>
            Refresh from BGG
          </button>
          <button type="button" onClick={onDelete} className={`${btn} bg-red-600 hover:bg-red-500`}>
            Remove Game
          </button>
        </>
      )}
      {game.bggUrl && (
        <a href={game.bggUrl} target="_blank" rel="noreferrer" className={`${btn} bg-gray-700 hover:bg-gray-600`}>
          View on BGG ↗
        </a>
      )}
    </div>
  );
}

export function DetailsPage() {
  const { bggId } = useParams();
  const baseId = Number(bggId);
  const navigate = useNavigate();
  const [view, setView] = useState<View>({ id: baseId });
  const [prevBase, setPrevBase] = useState(baseId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);

  // Reset the in-page view when the route's base game changes (adjust-state-
  // during-render — the React-approved alternative to a setState effect).
  if (prevBase !== baseId) {
    setPrevBase(baseId);
    setView({ id: baseId });
  }

  const { data: game, isLoading } = useGame(view.id);
  const { data: auth } = useAuth();
  const isAdmin = Boolean(auth?.user);
  const patch = usePatchGame(view.id);
  const del = useDeleteGame();
  const refresh = useRefreshGame(view.id);

  if (isLoading) return <Spinner label="Loading…" />;
  if (!game) return <p className="p-8 text-center text-red-400">Game not found.</p>;

  const back = () => (view.base ? setView({ id: view.base.id }) : navigate('/'));
  const openExpansion = (id: number) => setView({ id, base: { id: game.bggId, name: game.name } });

  const doDelete = () =>
    del.mutate(game.bggId, {
      onSuccess: () => {
        toast.success(`Removed ${game.name}`);
        navigate('/');
      },
      onError: (e) => toast.error(e.message),
    });
  const doRefresh = () => {
    setConfirmRefresh(false);
    refresh.mutate(undefined, {
      onSuccess: () => toast.success(`Refreshed ${game.name}`),
      onError: (e) => toast.error(e.message),
    });
  };
  const togglePlayed = () => patch.mutate({ played: !game.played }, { onError: (e) => toast.error(e.message) });
  const toggleOwned = () => patch.mutate({ owned: !game.owned }, { onError: (e) => toast.error(e.message) });

  return (
    <div className="flex flex-col gap-4 p-4">
      <button type="button" onClick={back} className="self-start text-sm text-cyan-400 hover:underline">
        ← Back to {view.base ? view.base.name : 'Library'}
      </button>

      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <div
          className="relative h-[300px] rounded-lg bg-gray-700 bg-cover bg-top"
          style={game.image ? { backgroundImage: `url("${game.image}")` } : undefined}
        >
          {game.played && <span className="absolute right-2 top-2 rounded-full bg-green-600 px-2 py-0.5 text-xs">✓ Played</span>}
        </div>
        <div>
          <h1 className="text-3xl font-bold uppercase">{game.name}</h1>
          {game.description && <p className="mt-2 text-sm text-gray-300">{decodeHtml(game.description)}</p>}
          <div className="mt-4">
            <DetailPanel game={game} />
          </div>
          {isAdmin && (
            <Actions
              game={game}
              onTogglePlayed={togglePlayed}
              onToggleOwned={toggleOwned}
              onDelete={() => setConfirmDelete(true)}
              onRefresh={() => setConfirmRefresh(true)}
            />
          )}
          <p className="mt-3 text-xs text-gray-500">Last Updated: {fmtDateTime(game.updateTime)}</p>
        </div>
      </div>

      {game.type === 'base' && <ExpansionsSection expansions={game.expansions} onOpen={openExpansion} />}

      <ConfirmDialog
        open={confirmDelete}
        title="Remove game?"
        message={`Remove ${game.name} from your library? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          doDelete();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmRefresh}
        title="Refresh from BGG?"
        message={`Re-fetch metadata for ${game.name} from BoardGameGeek?`}
        confirmLabel="Refresh"
        onConfirm={doRefresh}
        onCancel={() => setConfirmRefresh(false)}
      />
    </div>
  );
}
