import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BggSearchResultDto } from '../../shared/schemas/index.js';
import { api } from '../lib/api/endpoints';
import { AddPage } from './AddPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// A complete, correctly-typed BggSearchResultDto (every key required; nullable
// fields are explicit `null`). See src/shared/schemas/bgg.ts.
function result(over: Partial<BggSearchResultDto> = {}): BggSearchResultDto {
  return {
    bggId: 13,
    name: 'Catan',
    yearPublished: 1995,
    image: null,
    ratingAvg: 7.1,
    publishers: ['Kosmos'],
    minPlayers: 3,
    maxPlayers: 4,
    playtime: 60,
    families: [],
    type: 'base',
    inLibrary: false,
    ...over,
  };
}

function renderAddPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AddPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AddPage search submission', () => {
  it('does NOT call the search API for a whitespace-only query', async () => {
    const searchSpy = vi.spyOn(api, 'search').mockResolvedValue([]);
    const user = userEvent.setup();
    renderAddPage();

    await user.type(screen.getByRole('textbox'), '   ');
    await user.click(screen.getByRole('button', { name: /search/i }));

    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('calls the search API once with the TRIMMED query for a padded query', async () => {
    const searchSpy = vi.spyOn(api, 'search').mockResolvedValue([]);
    const user = userEvent.setup();
    renderAddPage();

    await user.type(screen.getByRole('textbox'), '  catan  ');
    await user.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(1));
    expect(searchSpy).toHaveBeenCalledWith('catan');
  });
});

describe('AddPage adding a result', () => {
  it('adds a non-in-library result by bggId, then clears the input and results on success', async () => {
    vi.spyOn(api, 'search').mockResolvedValue([result({ bggId: 42, name: 'Catan' })]);
    const addSpy = vi.spyOn(api, 'addGame').mockResolvedValue({} as never);
    const user = userEvent.setup();
    const input = () => screen.getByRole('textbox') as HTMLInputElement;
    renderAddPage();

    await user.type(input(), 'catan');
    await user.click(screen.getByRole('button', { name: /search/i }));

    const row = await screen.findByRole('button', { name: /catan/i });
    await user.click(row);

    await waitFor(() => expect(addSpy).toHaveBeenCalledWith(42));
    // onSuccess clears the query and calls search.reset() — input empties and the
    // result rows disappear.
    await waitFor(() => expect(input()).toHaveValue(''));
    expect(screen.queryByRole('button', { name: /catan/i })).toBeNull();
  });

  it('anchors the result thumbnail crop to the top (bg-top, not bg-center) and keeps grayscale on in-library rows', async () => {
    vi.spyOn(api, 'search').mockResolvedValue([
      result({ bggId: 1, name: 'Catan', image: 'https://example.com/catan.png', inLibrary: false }),
      result({ bggId: 2, name: 'Carcassonne', image: 'https://example.com/carc.png', inLibrary: true }),
    ]);
    const user = userEvent.setup();
    const { container } = renderAddPage();

    await user.type(screen.getByRole('textbox'), 'catan');
    await user.click(screen.getByRole('button', { name: /search/i }));

    await screen.findByText('Catan');
    const thumbs = container.querySelectorAll('div.bg-cover');
    expect(thumbs.length).toBe(2);
    for (const thumb of thumbs) {
      expect(thumb.className).toContain('bg-top');
      expect(thumb.className).not.toContain('bg-center');
    }

    // The in-library row (Carcassonne) still carries grayscale on its row control.
    const inLibraryRow = screen.getByRole('button', { name: /carcassonne/i });
    expect(inLibraryRow.className).toContain('grayscale');
    const availableRow = screen.getByRole('button', { name: /^catan/i });
    expect(availableRow.className).not.toContain('grayscale');
  });

  it('renders an in-library result as a disabled control that cannot be added', async () => {
    vi.spyOn(api, 'search').mockResolvedValue([result({ bggId: 42, name: 'Catan', inLibrary: true })]);
    const addSpy = vi.spyOn(api, 'addGame').mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderAddPage();

    await user.type(screen.getByRole('textbox'), 'catan');
    await user.click(screen.getByRole('button', { name: /search/i }));

    const row = await screen.findByRole('button', { name: /catan/i });
    expect(row).toBeDisabled();
    expect(screen.getByText(/in library/i)).toBeInTheDocument();

    await user.click(row);
    expect(addSpy).not.toHaveBeenCalled();
  });
});
