import { fetchApi } from './client';
import type {
  BackupSummary,
  BackupCreatedResponse,
  RestoreResult,
} from '../../../shared/schemas/index.js';

/** Admin Backup & Restore API surface. Kept separate from the core `api` object
 * (endpoints.ts) since these are admin-only and include a binary download. */
export const backupsApi = {
  list: () => fetchApi<BackupSummary[]>('/api/admin/backups'),
  create: () => fetchApi<BackupCreatedResponse>('/api/admin/backups', { method: 'POST' }),
  restore: (filename: string) =>
    fetchApi<RestoreResult>(`/api/admin/backups/${encodeURIComponent(filename)}/restore`, {
      method: 'POST',
    }),
  /** Restore an uploaded file: its raw JSON text is the request body. */
  restoreUpload: (json: string) =>
    fetchApi<RestoreResult>('/api/admin/backups/restore-upload', { method: 'POST', body: json }),
  delete: (filename: string) =>
    fetchApi<void>(`/api/admin/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
  /** Blob-fetch a backup and trigger a browser download (off-box copy). */
  download: async (filename: string): Promise<void> => {
    const res = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}/download`, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
