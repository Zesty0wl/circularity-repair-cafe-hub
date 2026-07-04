import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IncomingMessage } from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { audit } from '../../utils/audit.js';
import {
  BACKUP_FORMAT_VERSION,
  APP_VERSION,
} from '../../version.js';
import {
  createBackup,
  restoreBackup,
  streamToFile,
  suggestedBackupFilename,
} from '../../services/backup.js';
import { db } from '../../db/index.js';
import { cafes } from '../../db/schema.js';

// Upload limit for restore: very generous since it's a privileged endpoint
// and the all-in-one container has the /data volume to spill into.
const RESTORE_MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

const CONFIRM_HEADER = 'x-confirm-wipe';
const CONFIRM_VALUE = 'WIPE AND RESTORE';

export async function adminBackupRoutes(app: FastifyInstance): Promise<void> {
  // ─── Custom parser for application/zip restore uploads ──────────────
  // We bypass @fastify/multipart so the global 10 MB file-size cap doesn't
  // apply. The browser uploads the raw zip as the request body; we stream
  // it straight to a tmp file and the route picks it up by path.
  app.addContentTypeParser(
    'application/zip',
    { bodyLimit: RESTORE_MAX_BYTES },
    async (req: FastifyRequest, payload: IncomingMessage) => {
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'circ-upload-'));
      const tmpPath = path.join(tmpDir, 'backup.zip');
      const bytes = await streamToFile(payload, tmpPath);
      req.log.info({ bytes, tmpPath }, 'received restore upload');
      return { tmpPath, bytes };
    },
  );

  // ─── Metadata for the admin UI ──────────────────────────────────────
  app.get(
    '/api/admin/backup/info',
    { preHandler: app.requireRole('super_admin') },
    async () => {
      return {
        appVersion: APP_VERSION,
        backupFormatVersion: BACKUP_FORMAT_VERSION,
        confirmPhrase: CONFIRM_VALUE,
      };
    },
  );

  // ─── Download a fresh backup ────────────────────────────────────────
  app.get(
    '/api/admin/backup/download',
    { preHandler: app.requireRole('super_admin') },
    async (request, reply) => {
      const me = request.auth!;
      const [cafe] = await db.select({ name: cafes.name, id: cafes.id }).from(cafes).limit(1);
      const filename = suggestedBackupFilename(cafe?.name ?? 'circularity');

      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Cache-Control', 'no-store');
      reply.hijack();

      try {
        const manifest = await createBackup(reply.raw);
        await audit({
          request,
          actorId: me.sub,
          actorType: me.role,
          action: 'backup.downloaded',
          entityType: 'cafe',
          entityId: cafe?.id ?? null,
          metadata: {
            appVersion: manifest.appVersion,
            counts: manifest.counts,
            filename,
          },
        });
      } catch (err) {
        request.log.error({ err }, 'backup failed');
        try {
          // The response was hijacked, so we have to end it manually. If
          // headers are already flushed (likely), the client just sees a
          // truncated download and the error is logged server-side.
          if (!reply.raw.headersSent) {
            reply.raw.statusCode = 500;
          }
          reply.raw.end();
        } catch {
          // ignore
        }
      }
    },
  );

  // ─── Upload + restore (destructive) ─────────────────────────────────
  app.post(
    '/api/admin/backup/restore',
    {
      preHandler: app.requireRole('super_admin'),
      bodyLimit: RESTORE_MAX_BYTES,
    },
    async (request, reply) => {
      const me = request.auth!;
      const confirm = request.headers[CONFIRM_HEADER];
      if (confirm !== CONFIRM_VALUE) {
        reply.code(400).send({
          error: `Missing or wrong ${CONFIRM_HEADER} header`,
          code: 'restore/confirm_required',
        });
        return;
      }

      const body = request.body as { tmpPath?: string; bytes?: number } | undefined;
      if (!body?.tmpPath || !fs.existsSync(body.tmpPath)) {
        reply.code(400).send({
          error: 'No backup zip uploaded. Send the file as application/zip body.',
          code: 'restore/no_file',
        });
        return;
      }

      const [cafe] = await db.select({ id: cafes.id }).from(cafes).limit(1);

      try {
        const result = await restoreBackup(body.tmpPath);
        await audit({
          request,
          actorId: me.sub,
          actorType: me.role,
          action: 'backup.restored',
          entityType: 'cafe',
          entityId: cafe?.id ?? null,
          metadata: {
            sourceAppVersion: result.manifest.appVersion,
            backupFormatVersion: result.manifest.backupFormatVersion,
            uploadBytes: body.bytes ?? null,
            counts: result.manifest.counts,
          },
        }).catch(() => {
          // The audit table was just dropped and recreated; audit might fail.
          // We've still logged via request.log below.
        });

        request.log.warn(
          { manifest: result.manifest },
          'restore completed, process will exit so s6 restarts node',
        );

        reply.send({
          ok: true,
          manifest: result.manifest,
          restartingIn: 1000,
        });

        // Schedule restart after the response is flushed.
        setTimeout(() => {
          // eslint-disable-next-line no-console
          console.warn('[restore] exiting so s6 restarts the node service');
          process.exit(0);
        }, 1000);
      } catch (err: any) {
        request.log.error({ err }, 'restore failed');
        reply.code(500).send({
          error: err?.message ?? 'Restore failed',
          code: 'restore/failed',
        });
      } finally {
        // Best-effort cleanup of the upload tmp file & its parent dir.
        try {
          await fsp.rm(path.dirname(body.tmpPath), { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    },
  );
}
