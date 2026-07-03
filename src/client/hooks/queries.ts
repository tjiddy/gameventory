import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api/endpoints';
import { queryKeys } from '../lib/queryKeys';

export function useGames() {
  return useQuery({ queryKey: queryKeys.games, queryFn: api.listGames });
}

export function useGame(bggId: number) {
  return useQuery({ queryKey: queryKeys.game(bggId), queryFn: () => api.getGame(bggId) });
}

export function useAuth() {
  return useQuery({ queryKey: queryKeys.auth, queryFn: api.authMe });
}

/** Polls every 2s while a refresh is running (also picks up cron-started runs). */
export function useRefreshStatus() {
  return useQuery({
    queryKey: queryKeys.refreshStatus,
    queryFn: api.refreshStatus,
    refetchInterval: (query) => (query.state.data?.state === 'running' ? 2000 : false),
  });
}
