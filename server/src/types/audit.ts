// Audit log and retention wire shapes (P5c). client/src/lib/audit.ts mirrors these.
import { z } from 'zod';
import { AUDIT_EVENT_ACTIONS, AUDIT_TARGET_TYPES } from '../db/schema';

export type AuditEventAction = (typeof AUDIT_EVENT_ACTIONS)[number];
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];
export type AuditDetail = Record<string, string | number | boolean | null>;

export interface AuditEventView {
  id: number;
  action: AuditEventAction;
  actorId: string | null;
  actorName: string | null;
  targetType: AuditTargetType;
  targetId: string;
  detail: AuditDetail;
  createdAt: string; // ISO 8601
}

export const auditQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const days = z.number().int().min(30).max(3650).nullable();
export const retentionInputSchema = z.strictObject({ documentsDays: days, conversationsDays: days });
export type RetentionSettings = z.infer<typeof retentionInputSchema>;
