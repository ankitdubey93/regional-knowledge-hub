import { and, asc, eq, sql } from 'drizzle-orm';
import { ENGAGEMENT_TEMPLATES } from '@chub/shared/data/engagementTemplates';
import type { FirmTemplateRef } from '@chub/shared/utils/engagements';
import { engagementTemplate } from '../db/schema';
import { withOrg, type Tx } from '../db/withOrg';
import type { TemplatePatch, TemplateView } from '../types/engagements';

// Every tenant query runs inside withOrg and keeps an explicit org_id predicate (Hard rule 11).

export function toTemplateView(r: typeof engagementTemplate.$inferSelect): TemplateView {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    seedId: r.seedId,
    steps: r.steps,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Inside a caller's withOrg transaction. Every firm template as a FirmTemplateRef. */
export async function firmTemplateRefs(tx: Tx, orgId: string): Promise<FirmTemplateRef[]> {
  const rows = await tx.select().from(engagementTemplate).where(eq(engagementTemplate.orgId, orgId));
  return rows.map((r) => ({ id: r.id, kind: r.kind, steps: r.steps, updatedAt: r.updatedAt.toISOString() }));
}

/** Ordered by name asc, then created_at asc. */
export async function listTemplates(orgId: string): Promise<TemplateView[]> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(engagementTemplate)
      .where(eq(engagementTemplate.orgId, orgId))
      .orderBy(asc(engagementTemplate.name), asc(engagementTemplate.createdAt));
    return rows.map(toTemplateView);
  });
}

/** null when not in this firm. */
export async function getTemplate(orgId: string, id: string): Promise<TemplateView | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(engagementTemplate)
      .where(and(eq(engagementTemplate.id, id), eq(engagementTemplate.orgId, orgId)))
      .limit(1);
    return rows[0] ? toTemplateView(rows[0]) : null;
  });
}

/** null when seedId is not in ENGAGEMENT_TEMPLATES. */
export async function copySeedTemplate(orgId: string, userId: string, seedId: string): Promise<TemplateView | null> {
  const seed = ENGAGEMENT_TEMPLATES.templates.find((t) => t.id === seedId);
  if (!seed) return null;
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .insert(engagementTemplate)
      .values({
        orgId,
        name: seed.name,
        kind: seed.kind,
        seedId: seed.id,
        steps: seed.steps.map((s) => ({ ...s })),
        createdBy: userId,
      })
      .returning();
    return toTemplateView(rows[0]!);
  });
}

/** null when not in this firm. Sets only the given fields, plus updated_at = now(). */
export async function updateTemplate(orgId: string, id: string, patch: TemplatePatch): Promise<TemplateView | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .update(engagementTemplate)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.steps !== undefined ? { steps: patch.steps } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(engagementTemplate.id, id), eq(engagementTemplate.orgId, orgId)))
      .returning();
    return rows[0] ? toTemplateView(rows[0]) : null;
  });
}

/** false when not in this firm. */
export async function deleteTemplate(orgId: string, id: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .delete(engagementTemplate)
      .where(and(eq(engagementTemplate.id, id), eq(engagementTemplate.orgId, orgId)))
      .returning({ id: engagementTemplate.id });
    return rows.length > 0;
  });
}
