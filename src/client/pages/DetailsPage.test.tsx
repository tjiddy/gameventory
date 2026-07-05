import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ExpansionSummary, GameDetail } from '../../shared/schemas/index.js';
import { api } from '../lib/api/endpoints';
import { queryKeys } from '../lib/queryKeys';
import { DetailsPage } from './DetailsPage';

// jsdom doesn't implement <dialog>.showModal/close — stub them so ConfirmDialog
// mounts without throwing.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function expansion(over: Partial<ExpansionSummary> = {}): ExpansionSummary {
  return {
    bggId: 99,
    name: 'Seafarers',
    yearPublished: 1997,
    image: null,
    description: null,
    ratingAvg: 7.0,
    weightAvg: 2.3,
    owned: true,
    played: false,
    hydrated: true,
    ...over,
  };
}

function game(over: Partial<GameDetail> = {}): GameDetail {
  return {
    bggId: 1,
    name: 'Catan',
    image: null,
    tagline: null,
    yearPublished: 1995,
    minPlayers: 3,
    maxPlayers: 4,
    playtime: 60,
    ratingAvg: 7.1,
    ratingBavg: null,
    ratingVotes: null,
    weightAvg: null,
    isCooperative: false,
    isLegacy: false,
    isCampaign: false,
    is18xx: false,
    designers: [],
    publishers: [],
    artists: [],
    families: [],
    categories: [],
    mechanics: [],
    owned: true,
    played: false,
    createTime: 0,
    updateTime: 0,
    description: null,
    bggUrl: null,
    thumbnail: null,
    ratingStdev: null,
    weightVotes: null,
    rank: null,
    minPlaytime: null,
    maxPlaytime: null,
    type: 'base',
    hydrated: true,
    expansions: [],
    ...over,
  };
}

/** Render DetailsPage through the production `/details/:bggId` route so
 * `useParams().bggId` resolves against the real path shape. Seeds each supplied
 * game into the cache and mocks `getGame`/`authMe` to resolve the same. */
function renderDetails(games: GameDetail[], user: { displayName: string } | null) {
  const byId = new Map(games.map((g) => [g.bggId, g]));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(queryKeys.auth, { user });
  for (const g of games) qc.setQueryData(queryKeys.game(g.bggId), g);

  vi.spyOn(api, 'getGame').mockImplementation((id: number) => {
    const g = byId.get(id);
    return g ? Promise.resolve(g) : Promise.reject(new Error('not found'));
  });
  vi.spyOn(api, 'authMe').mockResolvedValue({ user });

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/details/1']}>
        <Routes>
          <Route path="/details/:bggId" element={<DetailsPage />} />
        </Routes>
        <NavHarness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** A sibling inside the SAME MemoryRouter that drives an in-router navigation —
 * changing the location without remounting DetailsPage. */
function NavHarness() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/details/2')}>
      goto-2
    </button>
  );
}

describe('DetailsPage admin-actions gate', () => {
  const actionNames = [/mark as played/i, /mark as owned/i, /refresh from bgg/i, /remove game/i];

  it('hides the Actions block for an anonymous visitor', async () => {
    renderDetails([game()], null);
    await screen.findByRole('heading', { name: /catan/i });
    for (const name of actionNames) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('renders the type-appropriate Actions for an admin', async () => {
    // base + owned: shows Mark as Played, Refresh from BGG, Remove Game; a base is
    // not ownable-toggled so "Mark as Owned" stays hidden.
    renderDetails([game({ owned: true, type: 'base' })], { displayName: 'Todd' });
    await screen.findByRole('heading', { name: /catan/i });

    expect(screen.getByRole('button', { name: /mark as played/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh from bgg/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove game/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark as owned/i })).toBeNull();
  });
});

describe('DetailsPage expansion view reset', () => {
  it('resets the in-page view when the SAME mounted instance sees a new base game', async () => {
    const exp = expansion({ bggId: 99, name: 'Seafarers' });
    const base1 = game({ bggId: 1, name: 'Catan', expansions: [exp] });
    const base2 = game({ bggId: 2, name: 'Carcassonne' });
    const expDetail = game({ bggId: 99, name: 'Seafarers', type: 'expansion' });
    const user = userEvent.setup();

    renderDetails([base1, base2, expDetail], null);

    // Baseline: back link points to the library.
    await screen.findByRole('button', { name: /back to library/i });

    // Open the expansion → the in-page view switches; back link now names base 1.
    await user.click(screen.getByRole('button', { name: /seafarers/i }));
    await screen.findByRole('button', { name: /back to catan/i });

    // In-router navigation to a different base on the STILL-MOUNTED DetailsPage.
    // React Router keeps the element mounted (same route pattern) and only updates
    // useParams().bggId → prevBase !== baseId fires and resets the view to base 2.
    await user.click(screen.getByRole('button', { name: /goto-2/i }));
    await screen.findByRole('button', { name: /back to library/i });
    expect(screen.queryByRole('button', { name: /back to catan/i })).toBeNull();
  });
});
