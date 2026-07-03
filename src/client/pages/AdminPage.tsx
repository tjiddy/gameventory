import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { RestoreResult } from '../../shared/schemas/index.js';
import { useAuth } from '../hooks/queries';
import {
  useBackups,
  useCreateBackup,
  useDeleteBackup,
  useRestoreBackup,
  useRestoreUpload,
} from '../hooks/backups';
import { backupsApi } from '../lib/api/backups';
import { BackupTable } from '../components/BackupTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Spinner } from '../components/Spinner';

type Pending =
  | { kind: 'restore'; filename: string }
  | { kind: 'delete'; filename: string }
  | { kind: 'upload'; name: string; json: string };

const RESTORE_MESSAGE = 'Replace your entire library? A safety backup is taken first.';

function restoreToast(result: RestoreResult) {
  const { games, expansionLinks, statHistory } = result.restored;
  toast.success(`Restored ${games} games, ${expansionLinks} links, ${statHistory} samples`);
  if (result.warnings.length > 0) toast.warning(`${result.warnings.length} warning(s) during restore`);
}

/** Admin-only panel (issue #3). Gates on `useAuth` itself so an anonymous user who
 * navigates directly to `/admin` sees no Backup & Restore shell and the page issues
 * NO admin API calls (the data hooks live in the admin-only sub-component). */
export function AdminPage() {
  const { data: auth } = useAuth();
  if (!auth?.user) return <AdminsOnly />;
  return <BackupRestorePanel />;
}

function AdminsOnly() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-bold">Admins only</h1>
      <p className="text-gray-400">You need to be signed in as an admin to manage backups.</p>
      <Link to="/login" className="rounded bg-cyan-600 px-4 py-2 font-medium hover:bg-cyan-500">
        Sign in
      </Link>
    </div>
  );
}

function BackupRestorePanel() {
  const backups = useBackups();
  const create = useCreateBackup();
  const del = useDeleteBackup();
  const restore = useRestoreBackup();
  const upload = useRestoreUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const onCreate = () =>
    create.mutate(undefined, {
      onSuccess: (info) => toast.success(`Backup created — ${info.gameCount} games`),
      onError: (e) => toast.error(e.message),
    });

  const onPickFile = () => fileInput.current?.click();

  const onFileChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    const json = await file.text();
    setPending({ kind: 'upload', name: file.name, json });
  };

  const onConfirm = () => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (p.kind === 'delete') {
      del.mutate(p.filename, {
        onSuccess: () => toast.success('Backup deleted'),
        onError: (e) => toast.error(e.message),
      });
    } else if (p.kind === 'restore') {
      restore.mutate(p.filename, { onSuccess: restoreToast, onError: (e) => toast.error(e.message) });
    } else {
      upload.mutate(p.json, { onSuccess: restoreToast, onError: (e) => toast.error(e.message) });
    }
  };

  const confirm =
    pending?.kind === 'delete'
      ? { title: 'Delete this backup?', message: `Permanently delete ${pending.filename}.`, label: 'Delete', destructive: true }
      : pending?.kind === 'restore'
        ? { title: 'Restore this backup?', message: RESTORE_MESSAGE, label: 'Restore', destructive: true }
        : pending?.kind === 'upload'
          ? { title: 'Restore from uploaded file?', message: RESTORE_MESSAGE, label: 'Restore', destructive: true }
          : { title: '', message: '', label: 'Confirm', destructive: false };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-bold">Backup &amp; Restore</h1>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onCreate}
            disabled={create.isPending}
            className="rounded bg-cyan-600 px-4 py-2 font-medium hover:bg-cyan-500 disabled:opacity-50"
          >
            Create Backup
          </button>
          <button
            type="button"
            onClick={onPickFile}
            disabled={upload.isPending}
            className="rounded bg-gray-700 px-4 py-2 font-medium hover:bg-gray-600 disabled:opacity-50"
          >
            Restore from Backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Restore backup file"
            onChange={onFileChosen}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Backups are stored on the server’s data volume. A restore replaces the whole library; a
          safety backup is taken first.
        </p>
      </section>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-3 text-lg font-semibold">Backups</h2>
        {backups.isPending ? (
          <Spinner label="Loading backups…" />
        ) : backups.isError ? (
          <p className="text-red-400">Failed to load backups: {backups.error.message}</p>
        ) : (
          <BackupTable
            backups={backups.data}
            onRestore={(filename) => setPending({ kind: 'restore', filename })}
            onDownload={(filename) => void backupsApi.download(filename).catch((e) => toast.error(String(e)))}
            onDelete={(filename) => setPending({ kind: 'delete', filename })}
          />
        )}
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.label}
        destructive={confirm.destructive}
        onConfirm={onConfirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
