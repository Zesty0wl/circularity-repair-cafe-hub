import type { FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { auditLog } from '../db/schema.js';

interface AuditOptions {
  request?: FastifyRequest;
  actorId?: string | null;
  actorType: 'admin' | 'repairer' | 'customer' | 'system' | 'super_admin';
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function audit(opts: AuditOptions): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: opts.actorId ?? null,
      actorType: opts.actorType,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId ?? null,
      metadata: (opts.metadata ?? {}) as Record<string, unknown>,
      ipAddress: opts.request?.ip ?? null,
    });
  } catch (err) {
    // Audit must never break the operation
    opts.request?.log.warn({ err }, 'audit log failed');
  }
}
