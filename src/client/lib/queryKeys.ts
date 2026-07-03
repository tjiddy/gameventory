export const queryKeys = {
  games: ['games'] as const,
  game: (bggId: number) => ['game', bggId] as const,
  refreshStatus: ['refresh', 'status'] as const,
  auth: ['auth', 'me'] as const,
};
