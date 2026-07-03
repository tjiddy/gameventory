import { fetchApi } from './client';
import type {
  GameSummary,
  GameDetail,
  PatchGameBody,
  RefreshStatus,
  BggSearchResultDto,
  AuthMeResponse,
} from '../../../shared/schemas/index.js';

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

/** The typed API surface. Components never call fetch directly — only through here. */
export const api = {
  listGames: () => fetchApi<GameSummary[]>('/api/games'),
  getGame: (bggId: number) => fetchApi<GameDetail>(`/api/games/${bggId}`),
  addGame: (bggId: number) => fetchApi<GameDetail>('/api/games', { method: 'POST', ...json({ bggId }) }),
  patchGame: (bggId: number, body: PatchGameBody) =>
    fetchApi<GameDetail>(`/api/games/${bggId}`, { method: 'PATCH', ...json(body) }),
  deleteGame: (bggId: number) => fetchApi<void>(`/api/games/${bggId}`, { method: 'DELETE' }),
  refreshGame: (bggId: number) => fetchApi<GameDetail>(`/api/games/${bggId}/refresh`, { method: 'POST' }),
  startRefreshAll: () => fetchApi<{ started: boolean }>('/api/refresh', { method: 'POST' }),
  refreshStatus: () => fetchApi<RefreshStatus>('/api/refresh/status'),
  search: (q: string) => fetchApi<BggSearchResultDto[]>(`/api/bgg/search?q=${encodeURIComponent(q)}`),
  authMe: () => fetchApi<AuthMeResponse>('/api/auth/me'),
};
