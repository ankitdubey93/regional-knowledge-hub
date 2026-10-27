import type { db } from '../db/client';
import type { Tx } from '../db/withOrg';
import { adminAudit } from '../db/schema';

export type AuditAction =
  | 'user.ban' | 'user.unban'
  | 'kb.source.create' | 'kb.source.update'
  | 'kb.version.create' | 'kb.version.update' | 'kb.version.publish' | 'kb.version.withdraw'
  | 'kb.embed_missing' | 'kb.seed'
  | 'kb.fact.create' | 'kb.fact.update';

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  targetType: 'user' | 'kb_source' | 'kb_version' | 'kb' | 'kb_fact';
  targetId: string;
  detail?: Record<string, string | number | boolean | null>;
}

/** Never put document text, pasted text or a message body in detail (Hard rule 13). */
export async function recordAudit(exec: Tx | typeof db, entry: AuditEntry): Promise<void> {
  await exec.insert(adminAudit).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    detail: entry.detail ?? {},
  });
}
