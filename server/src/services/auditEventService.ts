// The firm's audit trail (P5c). Append-only: chub_app has INSERT and SELECT only (0033). Not admin_audit, which is auditService.ts.
import { and, desc, eq, lt } from 'drizzle-orm';
import { auditEvent, user } from '../db/schema';
import { withOrg, type Tx } from '../db/withOrg';
import type { AuditDetail, AuditEventAction, AuditEventView, AuditTargetType } from '../types/audit';
import { ipKey } from './rateLimitService';

export interface AuditActor { userId: string; ipKey: string | null }
export interface AuditEventInput {
  orgId: string;
  actorId: string | null;
  action: AuditEventAction;
  targetType: AuditTargetType;
  targetId: string;
  ipKey: string | null;
  detail?: AuditDetail;
}

/** ipKey(ip) when ip is a non-empty string, else null. */
export function actorFrom(userId: string, ip: string | undefined): AuditActor {
  return { userId, ipKey: ip ? ipKey(ip) : null };
}

/** Inserts one row with the caller's tx (inside the caller's withOrg). detail defaults to {}. */
export async function recordEvent(tx: Tx, event: AuditEventInput): Promise<void> {
  await tx.insert(auditEvent).values({
    orgId: event.orgId,
    actorId: event.actorId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    ipKey: event.ipKey,
    detail: event.detail ?? {},
  });
}

/** recordEvent in its own withOrg: for Better Auth hooks, which run outside our transactions. */
export async function recordEventForOrg(event: AuditEventInput): Promise<void> {
  await withOrg(event.orgId, (tx) => recordEvent(tx, event));
}

/** Newest first. Never selects ipKey. */
export async function listEvents(
  orgId: string,
  before: number | null,
  limit: number,
): Promise<{ events: AuditEventView[]; nextBefore: number | null }> {
  const rows = await withOrg(orgId, (tx) =>
    tx
      .select({
        id: auditEvent.id,
        action: auditEvent.action,
        actorId: auditEvent.actorId,
        actorName: user.name,
        targetType: auditEvent.targetType,
        targetId: auditEvent.targetId,
        detail: auditEvent.detail,
        createdAt: auditEvent.createdAt,
      })
      .from(auditEvent)
      .leftJoin(user, eq(user.id, auditEvent.actorId))
      .where(
        before !== null
          ? and(eq(auditEvent.orgId, orgId), lt(auditEvent.id, before))
          : eq(auditEvent.orgId, orgId),
      )
      .orderBy(desc(auditEvent.id))
      .limit(limit),
  );
  const events: AuditEventView[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    actorId: r.actorId,
    actorName: r.actorName,
    targetType: r.targetType,
    targetId: r.targetId,
    detail: r.detail,
    createdAt: r.createdAt.toISOString(),
  }));
  const last = events[events.length - 1];
  return { events, nextBefore: events.length === limit && last ? last.id : null };
}
