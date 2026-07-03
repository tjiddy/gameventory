import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../lib/queryKeys';
import { backupsApi } from '../lib/api/backups';
import { AdminPage } from './AdminPage';

// jsdom doesn't implement <dialog>.showModal/close — stub them so ConfirmDialog's
// effect doesn't throw when opened.
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

function renderAdmin(user: { displayName: string } | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(queryKeys.auth, { user });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminPage access control', () => {
  it('anonymous direct visit renders an "Admins only" notice and issues NO admin API calls', () => {
    const listSpy = vi.spyOn(backupsApi, 'list').mockResolvedValue([]);
    renderAdmin(null);
    expect(screen.getByText(/admins only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create backup/i })).toBeNull();
    expect(listSpy).not.toHaveBeenCalled();
  });
});

describe('AdminPage interactions (admin session)', () => {
  const row = {
    filename: 'gameventory-backup-20260101T000000000Z.json',
    gameCount: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    size: 2048,
  };

  it('wires create, and restore/delete through the confirm dialog', async () => {
    vi.spyOn(backupsApi, 'list').mockResolvedValue([row]);
    const createSpy = vi.spyOn(backupsApi, 'create').mockResolvedValue({ filename: 'x', createdAt: 'x', size: 1, gameCount: 3 });
    const restoreSpy = vi.spyOn(backupsApi, 'restore').mockResolvedValue({ restored: { games: 3, expansionLinks: 0, statHistory: 0 }, warnings: [], safetyBackup: 's' });
    const deleteSpy = vi.spyOn(backupsApi, 'delete').mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderAdmin({ displayName: 'Todd' });

    // The backup row renders (an admin API call WAS issued for the admin).
    await screen.findByText(row.filename);

    // Create.
    await user.click(screen.getByRole('button', { name: /create backup/i }));
    expect(createSpy).toHaveBeenCalledTimes(1);

    // Restore → confirm dialog → confirm.
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    const restoreDialog = screen.getByText(/replace your entire library/i).closest('dialog') as HTMLElement;
    await user.click(within(restoreDialog).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restoreSpy).toHaveBeenCalledWith(row.filename));

    // Delete → confirm dialog → confirm.
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const deleteDialog = screen.getByText(/delete this backup/i).closest('dialog') as HTMLElement;
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(row.filename));
  });
});
