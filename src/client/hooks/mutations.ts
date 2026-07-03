import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api/endpoints';
import { queryKeys } from '../lib/queryKeys';
import type { PatchGameBody } from '../../shared/schemas/index.js';

export function useAddGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bggId: number) => api.addGame(bggId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.games }),
  });
}

export function usePatchGame(bggId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchGameBody) => api.patchGame(bggId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.game(bggId) });
      void qc.invalidateQueries({ queryKey: queryKeys.games });
    },
  });
}

export function useDeleteGame() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bggId: number) => api.deleteGame(bggId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.games }),
  });
}

export function useRefreshGame(bggId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.refreshGame(bggId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.game(bggId) });
      void qc.invalidateQueries({ queryKey: queryKeys.games });
    },
  });
}

export function useStartRefreshAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.startRefreshAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.refreshStatus }),
  });
}

export function useSearch() {
  return useMutation({ mutationFn: (q: string) => api.search(q) });
}
