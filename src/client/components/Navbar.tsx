import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/queries';
import { useStartRefreshAll } from '../hooks/mutations';
import { ConfirmDialog } from './ConfirmDialog';

declare const __GIT_COMMIT__: string;

function NavLinks({
  isAdmin,
  displayName,
  onRefresh,
}: {
  isAdmin: boolean;
  displayName: string | null;
  onRefresh: () => void;
}) {
  return (
    <>
      <Link to="/" className="hover:text-cyan-400">Library</Link>
      {isAdmin && <Link to="/add" className="hover:text-cyan-400">Add Game</Link>}
      {isAdmin && (
        <button type="button" onClick={onRefresh} className="hover:text-cyan-400" aria-label="Refresh all">
          ⟳ Refresh All
        </button>
      )}
      {isAdmin ? (
        <span className="text-gray-400">{displayName}</span>
      ) : (
        <a href="/api/auth/oidc/authelia/login" className="hover:text-cyan-400">Login</a>
      )}
    </>
  );
}

export function Navbar() {
  const { data: auth } = useAuth();
  const isAdmin = Boolean(auth?.user);
  const displayName = auth?.user?.displayName ?? null;
  const startRefresh = useStartRefreshAll();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const onRefresh = () => {
    setMenuOpen(false);
    setConfirmRefresh(true);
  };

  return (
    <header className="border-b border-gray-800 bg-gray-900">
      <nav className="flex items-center justify-between p-3">
        <Link to="/" className="font-display text-2xl tracking-wide">🎲 GAMEVENTORY</Link>

        <div className="hidden items-center gap-4 text-sm md:flex">
          <NavLinks isAdmin={isAdmin} displayName={displayName} onRefresh={onRefresh} />
          <button type="button" onClick={() => setAboutOpen((o) => !o)} aria-label="About" className="text-gray-400">ⓘ</button>
        </div>

        <button type="button" className="text-2xl md:hidden" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>☰</button>
      </nav>

      {menuOpen && (
        <div className="flex flex-col gap-3 border-t border-gray-800 p-3 text-sm md:hidden">
          <NavLinks isAdmin={isAdmin} displayName={displayName} onRefresh={onRefresh} />
        </div>
      )}

      {aboutOpen && (
        <div className="border-t border-gray-800 p-2 text-center text-xs text-gray-500">
          Gameventory · build {__GIT_COMMIT__}
        </div>
      )}

      <ConfirmDialog
        open={confirmRefresh}
        title="Refresh all games?"
        message="This re-fetches metadata for every game from BGG and will take a while."
        confirmLabel="Refresh All"
        onConfirm={() => {
          setConfirmRefresh(false);
          startRefresh.mutate();
        }}
        onCancel={() => setConfirmRefresh(false)}
      />
    </header>
  );
}
