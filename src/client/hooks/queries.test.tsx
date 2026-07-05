import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RefreshStatus } from '../../shared/schemas/index.js';
import { api } from '../lib/api/endpoints';
import { useRefreshStatus } from './queries';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function status(over: Partial<RefreshStatus> = {}): RefreshStatus {
  return {
    state: 'idle',
    current: 0,
    total: 0,
    currentGameName: null,
    startedAt: null,
    finishedAt: null,
    failures: [],
    ...over,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useRefreshStatus polling', () => {
  it('polls again after ~2000ms while a run is running', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(api, 'refreshStatus').mockResolvedValue(status({ state: 'running' }));
    renderHook(() => useRefreshStatus(), { wrapper });

    // Let the initial fetch resolve.
    await vi.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalledTimes(1);

    // refetchInterval returned 2000 (running) → a second poll fires.
    await vi.advanceTimersByTimeAsync(2000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does NOT poll again while the run is idle', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(api, 'refreshStatus').mockResolvedValue(status({ state: 'idle' }));
    renderHook(() => useRefreshStatus(), { wrapper });

    await vi.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalledTimes(1);

    // refetchInterval returned false (idle) → no follow-up poll even well past 2s.
    await vi.advanceTimersByTimeAsync(10000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
