// Audit log and retention (P5c). Wire shapes mirror server/src/types/audit.ts.
import { z } from 'zod';
import { apiJson } from './api';

export const AUDIT_ACTIONS = ['sign_in', 'document.upload', 'document.download', 'document.delete', 'ledger.import', 'ledger.delete', 'member.invite', 'member.remove', 'member.role', 'retention.update', 'retention.purge'] as const;
export const AUDIT_TARGET_TYPES = ['user', 'document', 'ledger_import', 'invitation', 'member', 'organization'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export const ACTION_LABELS: Record<AuditAction, string> = {
  sign_in: 'Signed in',
  'document.upload': 'Uploaded a document',
  'document.download': 'Downloaded a document',
  'document.delete': 'Deleted a document',
  'ledger.import': 'Imported a trial balance',
  'ledger.delete': 'Deleted a trial balance import',
  'member.invite': 'Invited someone',
  'member.remove': 'Removed a member',
  'member.role': "Changed a member's role",
  'retention.update': 'Changed retention',
  'retention.purge': 'Purged old records',
};
export const TARGET_LABELS: Record<AuditTargetType, string> = {
  user: 'User', document: 'Document', ledger_import: 'Trial balance import',
  invitation: 'Invitation', member: 'Member', organization: 'Workspace',
};

export const auditEventSchema = z.object({
  id: z.number().int(),
  action: z.enum(AUDIT_ACTIONS),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  targetType: z.enum(AUDIT_TARGET_TYPES),
  targetId: z.string(),
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
export const auditPageSchema = z.object({ events: z.array(auditEventSchema), nextBefore: z.number().int().nullable() });
export type AuditPage = z.infer<typeof auditPageSchema>;
export const retentionSchema = z.object({ documentsDays: z.number().int().nullable(), conversationsDays: z.number().int().nullable() });
export type RetentionSettings = z.infer<typeof retentionSchema>;

/** GET /audit?limit=50, plus &before=<before> when before is not null. */
export async function listAuditEvents(before: number | null): Promise<AuditPage> {
  const query = before === null ? 'limit=50' : `limit=50&before=${before}`;
  const body = await apiJson<unknown>(`/audit?${query}`);
  return auditPageSchema.parse(body);
}

/** GET /workspace/retention → { retention, canEdit } */
export async function getRetention(): Promise<{ retention: RetentionSettings; canEdit: boolean }> {
  const body = await apiJson<unknown>('/workspace/retention');
  return z.object({ retention: retentionSchema, canEdit: z.boolean() }).parse(body);
}

/** PATCH /workspace/retention with the settings → { retention }; returns retention. */
export async function setRetention(input: RetentionSettings): Promise<RetentionSettings> {
  const body = await apiJson<unknown>('/workspace/retention', { method: 'PATCH', body: input });
  return z.object({ retention: retentionSchema }).parse(body).retention;
}
