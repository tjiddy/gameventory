import { useQuery } from '@tanstack/react-query';
import { fetchApi } from './lib/api/client';

interface Health {
  status: string;
  version: string;
}

// Phase 0 shell. Proves the client → /api proxy → Fastify → DB path is live.
// The real UI (library / details / add) lands in Phase 2.
export function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchApi<Health>('/api/health'),
  });

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Gameventory</h1>
      <p className="text-sm opacity-70">
        {isLoading && 'Checking API…'}
        {isError && 'API unreachable'}
        {data && `API: ${data.status} · ${data.version}`}
      </p>
    </main>
  );
}
