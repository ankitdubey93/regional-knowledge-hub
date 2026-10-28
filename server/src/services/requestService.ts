import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { INTAKE_RULES } from '@chub/shared/data/intakeRules';
import type { Fact } from '@chub/shared/data/schemas';
import {
  DEADLINE_FACT_KEYS,
  addDays,
  deadlineRulesFrom,
  defaultTimezone,
  obligationsFor,
  todayIn,
  type CalendarProfile,
  type DeadlineRules,
} from '@chub/shared/utils/deadlines';
import { datedRequestsFor, intakeItemsFor } from '@chub/shared/utils/intake';
import { db } from '../db/client';
import { client, documentRequest, kbFact } from '../db/schema';
import { withOrg, type Tx } from '../db/withOrg';
import type { RequestCreate, RequestPatch, RequestView } from '../types/requests';
import { rowToFact } from './kbService';

// Every tenant query runs inside withOrg and keeps an explicit org_id predicate (Hard rule 11). Never logs a label (Hard rule 13).
export const GENERATE_WINDOW_DAYS = 90; // untuned

export function toRequestView(r: typeof documentRequest.$inferSelect): RequestView {
  return {
    id: r.id,
    clientId: r.clientId,
    itemId: r.itemId,
    label: r.label,
    why: r.why,
    docId: r.docId,
    sourceUrl: r.sourceUrl,
    verifiedOn: r.verifiedOn,
    dueOn: r.dueOn,
    status: r.status,
    source: r.source,
    obligationId: r.obligationId,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function clientRow(tx: Tx, orgId: string, clientId: string) {
  const rows = await tx
    .select()
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

async function listIn(tx: Tx, orgId: string, clientId: string): Promise<RequestView[]> {
  const rows = await tx
    .select()
    .from(documentRequest)
    .where(and(eq(documentRequest.orgId, orgId), eq(documentRequest.clientId, clientId)))
    .orderBy(sql`${documentRequest.dueOn} asc nulls last`, asc(documentRequest.createdAt), asc(documentRequest.label));
  return rows.map(toRequestView);
}

/** null when the client is not in this firm. Ordered by due_on asc nulls last, then created_at asc, then label asc. */
export async function listRequests(orgId: string, clientId: string): Promise<RequestView[] | null> {
  return withOrg(orgId, async (tx) => {
    if (!(await clientRow(tx, orgId, clientId))) return null;
    return listIn(tx, orgId, clientId);
  });
}

export type GenerateOutcome =
  | { created: number; requests: RequestView[] }
  | { notFound: true }
  | { noProfile: true }
  | { factsMissing: true };

export async function generateRequests(orgId: string, userId: string, clientId: string, now: Date): Promise<GenerateOutcome> {
  // kb_fact is global, so it is read outside withOrg.
  const factRows = await db.select().from(kbFact).where(inArray(kbFact.key, [...DEADLINE_FACT_KEYS]));
  const byKey: Record<string, Fact> = {};
  for (const r of factRows) byKey[r.key] = rowToFact(r);
  let rules: DeadlineRules;
  try {
    rules = deadlineRulesFrom((k) => byKey[k]);
  } catch (e) {
    if (e instanceof TypeError) return { factsMissing: true };
    throw e;
  }

  return withOrg(orgId, async (tx): Promise<GenerateOutcome> => {
    const row = await clientRow(tx, orgId, clientId);
    if (!row) return { notFound: true };
    if (row.jurisdiction === 'AU+UK' || row.entityType === null) return { noProfile: true };
    const profile: CalendarProfile = {
      jurisdiction: row.jurisdiction,
      entityType: row.entityType,
      taxRegistered: row.taxRegistered,
      taxPeriod: row.taxPeriod,
      fyEndMonth: row.fyEndMonth,
      registeredOn: row.registeredOn,
      vatStaggerMonth: row.vatStaggerMonth,
      mtdItsa: row.mtdItsa,
    };
    const today = todayIn(row.timezone ?? defaultTimezone(row.jurisdiction), now);
    const obligations = obligationsFor(profile, rules, today, addDays(today, GENERATE_WINDOW_DAYS));
    const drafts = [...intakeItemsFor(profile, INTAKE_RULES), ...datedRequestsFor(profile, INTAKE_RULES, obligations)];
    let created = 0;
    if (drafts.length > 0) {
      const inserted = await tx
        .insert(documentRequest)
        .values(drafts.map((d) => ({ ...d, orgId, clientId, createdBy: userId })))
        .onConflictDoNothing()
        .returning({ id: documentRequest.id });
      created = inserted.length;
    }
    return { created, requests: await listIn(tx, orgId, clientId) };
  });
}

/** null when the client is not in this firm. */
export async function addRequest(orgId: string, userId: string, clientId: string, input: RequestCreate): Promise<RequestView | null> {
  return withOrg(orgId, async (tx) => {
    if (!(await clientRow(tx, orgId, clientId))) return null;
    const rows = await tx
      .insert(documentRequest)
      .values({
        orgId,
        clientId,
        itemId: 'manual.' + randomUUID(),
        label: input.label,
        why: '',
        dueOn: input.dueOn,
        source: 'manual',
        obligationId: null,
        createdBy: userId,
      })
      .returning();
    return toRequestView(rows[0]!);
  });
}

/** null when the request is not in this client and firm. Sets updated_at = now(). */
export async function updateRequest(orgId: string, clientId: string, requestId: string, patch: RequestPatch): Promise<RequestView | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .update(documentRequest)
      .set({ status: patch.status, updatedAt: sql`now()` })
      .where(and(eq(documentRequest.id, requestId), eq(documentRequest.clientId, clientId), eq(documentRequest.orgId, orgId)))
      .returning();
    return rows[0] ? toRequestView(rows[0]) : null;
  });
}

/** false when the request is not in this client and firm. */
export async function deleteRequest(orgId: string, clientId: string, requestId: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .delete(documentRequest)
      .where(and(eq(documentRequest.id, requestId), eq(documentRequest.clientId, clientId), eq(documentRequest.orgId, orgId)))
      .returning({ id: documentRequest.id });
    return rows.length > 0;
  });
}
