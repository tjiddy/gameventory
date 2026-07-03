import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useRefreshStatus } from '../hooks/queries';

/** Non-blocking progress strip driven by polling /api/refresh/status (§3.5). */
export function RefreshProgress() {
  const { data } = useRefreshStatus();
  const wasRunning = useRef(false);

  useEffect(() => {
    if (!data) return;
    if (wasRunning.current && data.state === 'idle') {
      const fails = data.failures.length;
      if (fails > 0) toast.warning(`Refresh complete — ${fails} game(s) failed`);
      else toast.success('Refresh complete');
    }
    wasRunning.current = data.state === 'running';
  }, [data]);

  if (!data || data.state !== 'running') return null;
  const pct = data.total ? Math.round((data.current / data.total) * 100) : 0;

  return (
    <div className="bg-gray-800 px-4 py-2 text-sm">
      <div className="mb-1 flex justify-between text-gray-300">
        <span>Refreshing {data.currentGameName ?? '…'} ({data.current}/{data.total})</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
        <div className="h-full bg-cyan-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
