import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { BackupService } from '../services/backup.service.js';
import {
  BackupList,
  BackupCreatedResponse,
  BackupFile,
  RestoreResult,
} from '../../shared/schemas/index.js';

// Uploaded backups are raw application/json; a full library JSON can run to several
// MB, well past Fastify's 1 MB default body limit.
const UPLOAD_BODY_LIMIT = 20 * 1024 * 1024;

const FilenameParam = z.object({ filename: z.string() });

/**
 * Admin Backup & Restore API (issue #3). The whole `/api/admin/*` prefix is
 * admin-only by construction (see `requiresAdmin`); anonymous requests 401 at the
 * auth hook before reaching these handlers.
 */
export async function adminRoutes(app: FastifyInstance, backups: BackupService): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get('/api/admin/backups', { schema: { response: { 200: BackupList } } }, () => backups.list());

  r.post(
    '/api/admin/backups',
    { schema: { response: { 201: BackupCreatedResponse } } },
    async (_req, reply) => {
      const info = await backups.create();
      reply.status(201);
      return info;
    },
  );

  r.get(
    '/api/admin/backups/:filename/download',
    { schema: { params: FilenameParam } },
    async (req, reply) => {
      const bytes = await backups.readBackup(req.params.filename);
      return reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="${req.params.filename}"`)
        .send(bytes);
    },
  );

  r.post(
    '/api/admin/backups/:filename/restore',
    { schema: { params: FilenameParam, response: { 200: RestoreResult } } },
    (req) => backups.restoreFromFile(req.params.filename),
  );

  r.delete('/api/admin/backups/:filename', { schema: { params: FilenameParam } }, async (req, reply) => {
    await backups.deleteBackup(req.params.filename);
    return reply.status(204).send();
  });

  r.post(
    '/api/admin/backups/restore-upload',
    { bodyLimit: UPLOAD_BODY_LIMIT, schema: { body: BackupFile, response: { 200: RestoreResult } } },
    (req) => backups.restore(req.body),
  );
}
