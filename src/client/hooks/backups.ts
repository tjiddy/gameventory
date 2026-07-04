import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backupsApi } from '../lib/api/backups';
import { queryKeys } from '../lib/queryKeys';

/** List server-side backups. Only mounted for admins (AdminPage gates on useAuth),
 * so anonymous visitors never issue this request. */
export function useBackups() {
  return useQuery({ queryKey: queryKeys.backups, queryFn: backupsApi.list });
}

export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => backupsApi.create(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.backups }),
  });
}

export function useDeleteBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => backupsApi.delete(filename),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.backups }),
  });
}

/** A restore replaces the whole library — invalidate games AND backups (a safety
 * backup was just created). */
function invalidateAfterRestore(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: queryKeys.games });
  void qc.invalidateQueries({ queryKey: queryKeys.backups });
}

export function useRestoreBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) => backupsApi.restore(filename),
    onSuccess: () => invalidateAfterRestore(qc),
  });
}

export function useRestoreUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (json: string) => backupsApi.restoreUpload(json),
    onSuccess: () => invalidateAfterRestore(qc),
  });
}
