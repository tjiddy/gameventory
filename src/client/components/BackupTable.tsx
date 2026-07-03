import type { BackupSummary } from '../../shared/schemas/index.js';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

interface BackupTableProps {
  backups: BackupSummary[];
  onRestore: (filename: string) => void;
  onDownload: (filename: string) => void;
  onDelete: (filename: string) => void;
}

/** The server backup list — Filename · Games · Date · Size + per-row actions.
 * `Games` shows `counts.baseGames` (`—` when the file's header can't be read). */
export function BackupTable({ backups, onRestore, onDownload, onDelete }: BackupTableProps) {
  if (backups.length === 0) {
    return <p className="text-sm text-gray-400">No backups yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-700 text-gray-400">
          <tr>
            <th className="py-2 pr-4 font-medium">Filename</th>
            <th className="py-2 pr-4 font-medium">Games</th>
            <th className="py-2 pr-4 font-medium">Date</th>
            <th className="py-2 pr-4 font-medium">Size</th>
            <th className="py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {backups.map((b) => (
            <tr key={b.filename} className="border-b border-gray-800">
              <td className="py-2 pr-4 font-mono text-xs break-all">{b.filename}</td>
              <td className="py-2 pr-4">{b.gameCount ?? '—'}</td>
              <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(b.createdAt)}</td>
              <td className="py-2 pr-4 whitespace-nowrap">{fmtSize(b.size)}</td>
              <td className="py-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onRestore(b.filename)}
                    className="rounded bg-cyan-700 px-2 py-1 text-xs hover:bg-cyan-600"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownload(b.filename)}
                    className="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(b.filename)}
                    className="rounded bg-red-800 px-2 py-1 text-xs hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
