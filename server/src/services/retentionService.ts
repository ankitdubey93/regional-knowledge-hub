import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { organization } from '../db/schema';
import { withOrg } from '../db/withOrg';
import type { RetentionSettings } from '../types/audit';
import { recordEvent, type AuditActor } from './auditEventService';

// organization is Better Auth's table, not a tenant table: read and written only for the orgId requireFirm took from the session.

/** A missing row gives both null (keep forever). */
export async function getRetention(orgId: string): Promise<RetentionSettings> {
  const rows = await db
    .select({ documentsDays: organization.retentionDaysDocuments, conversationsDays: organization.retentionDaysConversations })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  return rows[0] ?? { documentsDays: null, conversationsDays: null };
}

/** One transaction: update both columns, then record retention.update. Returns the saved values. */
export async function setRetention(orgId: string, actor: AuditActor, input: RetentionSettings): Promise<RetentionSettings> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .update(organization)
      .set({ retentionDaysDocuments: input.documentsDays, retentionDaysConversations: input.conversationsDays })
      .where(eq(organization.id, orgId))
      .returning({ documentsDays: organization.retentionDaysDocuments, conversationsDays: organization.retentionDaysConversations });
    const saved = rows[0] ?? input;
    await recordEvent(tx, {
      orgId,
      actorId: actor.userId,
      ipKey: actor.ipKey,
      action: 'retention.update',
      targetType: 'organization',
      targetId: orgId,
      detail: { documentsDays: saved.documentsDays, conversationsDays: saved.conversationsDays },
    });
    return saved;
  });
}
