import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupsApi } from '../lib/api/backups';
import { queryKeys } from '../lib/queryKeys';
import { useRestoreBackup, useRestoreUpload } from './backups';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const restoreResult = {
  restored: { games: 3, expansionLinks: 0, statHistory: 0 },
  warnings: [],
  safetyBackup: 's',
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidate };
}

describe('useRestoreBackup', () => {
  it('invalidates BOTH the games and backups query keys after a successful restore', async () => {
    vi.spyOn(backupsApi, 'restore').mockResolvedValue(restoreResult);
    const { wrapper, invalidate } = makeWrapper();
    const { result } = renderHook(() => useRestoreBackup(), { wrapper });

    result.current.mutate('backup.json');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.games });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.backups });
  });
});

describe('useRestoreUpload', () => {
  it('shares invalidateAfterRestore — invalidates games and backups', async () => {
    vi.spyOn(backupsApi, 'restoreUpload').mockResolvedValue(restoreResult);
    const { wrapper, invalidate } = makeWrapper();
    const { result } = renderHook(() => useRestoreUpload(), { wrapper });

    result.current.mutate('{"format":"gameventory-backup"}');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.games });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.backups });
  });
});
