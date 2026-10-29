import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { ENGAGEMENT_TEMPLATES } from '@chub/shared/data/engagementTemplates';
import type { EngagementTemplateStep, Fact } from '@chub/shared/data/schemas';
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
import { OPEN_WINDOW_DAYS, engagementDraftsFor, templateFor, type EngagementKind } from '@chub/shared/utils/engagements';
import { db } from '../db/client';
import { client, engagement, kbFact, member, task, user } from '../db/schema';
import { withOrg, type Tx } from '../db/withOrg';
import type {
  EngagementCreate,
  EngagementFilter,
  EngagementPatch,
  EngagementView,
  MemberView,
  TaskView,
} from '../types/engagements';
import { rowToFact } from './kbService';
import { listTasksIn } from './taskService';
import { firmTemplateRefs } from './templateService';

// Every tenant query runs inside withOrg and keeps an explicit org_id predicate (Hard rule 11). Never logs a title (Hard rule 13).

const LIST_LIMIT = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function viewSelect(orgId: string) {
  return {
    id: engagement.id,
    clientId: engagement.clientId,
    clientName: client.name,
    templateId: engagement.templateId,
    title: engagement.title,
    kind: engagement.kind,
    periodEnd: engagement.periodEnd,
    dueOn: engagement.dueOn,
    status: engagement.status,
    obligationId: engagement.obligationId,
    taskCount: sql<number>`(select count(*)::int from "task" where "task"."engagement_id" = "engagement"."id" and "task"."org_id" = ${orgId})`,
    doneCount: sql<number>`(select count(*)::int from "task" where "task"."engagement_id" = "engagement"."id" and "task"."org_id" = ${orgId} and "task"."status" = 'done')`,
    createdBy: engagement.createdBy,
    createdAt: engagement.createdAt,
    updatedAt: engagement.updatedAt,
  };
}

type ViewRow = {
  id: string;
  clientId: string;
  clientName: string;
  templateId: string | null;
  title: string;
  kind: EngagementKind;
  periodEnd: string | null;
  dueOn: string;
  status: EngagementView['status'];
  obligationId: string | null;
  taskCount: number;
  doneCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function toView(r: ViewRow): EngagementView {
  return {
    id: r.id,
    clientId: r.clientId,
    clientName: r.clientName,
    templateId: r.templateId,
    title: r.title,
    kind: r.kind,
    periodEnd: r.periodEnd,
    dueOn: r.dueOn,
    status: r.status,
    obligationId: r.obligationId,
    taskCount: Number(r.taskCount),
    doneCount: Number(r.doneCount),
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function selectViews(tx: Tx, orgId: string, where: SQL | undefined): Promise<EngagementView[]> {
  const rows = await tx
    .select(viewSelect(orgId))
    .from(engagement)
    .innerJoin(client, and(eq(client.id, engagement.clientId), eq(client.orgId, orgId)))
    .where(and(eq(engagement.orgId, orgId), where))
    .orderBy(asc(engagement.dueOn), asc(engagement.title), asc(engagement.id))
    .limit(LIST_LIMIT);
  return rows.map(toView);
}

async function oneView(tx: Tx, orgId: string, id: string): Promise<EngagementView | null> {
  const rows = await selectViews(tx, orgId, eq(engagement.id, id));
  return rows[0] ?? null;
}

async function clientRow(tx: Tx, orgId: string, clientId: string) {
  const rows = await tx
    .select()
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
    .limit(1);
  return rows[0] ?? null;
}

/** status 'active' = planned, in_progress, review; a status = that status; 'all' = no filter. */
export async function listEngagements(orgId: string, userId: string, filter: EngagementFilter): Promise<EngagementView[]> {
  return withOrg(orgId, async (tx) => {
    const conds: SQL[] = [];
    if (filter.status === 'active') conds.push(inArray(engagement.status, ['planned', 'in_progress', 'review']));
    else if (filter.status !== 'all') conds.push(eq(engagement.status, filter.status));
    if (filter.mine === '1') {
      conds.push(
        sql`exists (select 1 from "task" where "task"."engagement_id" = "engagement"."id" and "task"."org_id" = ${orgId} and "task"."assignee_id" = ${userId})`,
      );
    }
    if (filter.clientId) conds.push(eq(engagement.clientId, filter.clientId));
    if (filter.dueBefore) conds.push(sql`${engagement.dueOn} <= ${filter.dueBefore}`);
    return selectViews(tx, orgId, conds.length ? and(...conds) : undefined);
  });
}

/** null when the client is not in this firm. */
export async function listClientEngagements(
  orgId: string,
  clientId: string,
): Promise<{ engagements: EngagementView[]; autoEngagements: boolean } | null> {
  return withOrg(orgId, async (tx) => {
    const row = await clientRow(tx, orgId, clientId);
    if (!row) return null;
    const engagements = await selectViews(tx, orgId, eq(engagement.clientId, clientId));
    return { engagements, autoEngagements: row.autoEngagements };
  });
}

/** null when not in this firm. */
export async function getEngagement(orgId: string, id: string): Promise<{ engagement: EngagementView; tasks: TaskView[] } | null> {
  return withOrg(orgId, async (tx) => {
    const view = await oneView(tx, orgId, id);
    if (!view) return null;
    return { engagement: view, tasks: await listTasksIn(tx, orgId, id) };
  });
}

export type CreateOutcome = { engagement: EngagementView } | { notFound: true } | { badTemplate: true };

export async function createFromTemplate(orgId: string, userId: string, clientId: string, input: EngagementCreate): Promise<CreateOutcome> {
  return withOrg(orgId, async (tx): Promise<CreateOutcome> => {
    const row = await clientRow(tx, orgId, clientId);
    if (!row) return { notFound: true };

    let kind: EngagementKind;
    let steps: EngagementTemplateStep[];
    if (input.templateId.startsWith('seed:')) {
      const seed = ENGAGEMENT_TEMPLATES.templates.find((t) => t.id === input.templateId.slice(5));
      if (!seed) return { badTemplate: true };
      kind = seed.kind;
      steps = seed.steps;
    } else {
      const firmId = input.templateId.slice(5);
      if (!UUID_RE.test(firmId)) return { badTemplate: true };
      const found = (await firmTemplateRefs(tx, orgId)).find((t) => t.id === firmId);
      if (!found) return { badTemplate: true };
      kind = found.kind;
      steps = found.steps;
    }

    const inserted = await tx
      .insert(engagement)
      .values({
        orgId,
        clientId,
        templateId: input.templateId,
        title: input.title,
        kind,
        periodEnd: input.periodEnd,
        dueOn: input.dueOn,
        obligationId: null,
        createdBy: userId,
      })
      .returning({ id: engagement.id });
    const id = inserted[0]!.id;
    if (steps.length > 0) {
      await tx.insert(task).values(
        steps.map((s, i) => ({
          orgId,
          engagementId: id,
          title: s.title,
          position: i,
          estimateMinutes: s.estimateMinutes,
          status: 'todo' as const,
        })),
      );
    }
    return { engagement: (await oneView(tx, orgId, id))! };
  });
}

/** null when the client is not in this firm; else the stored value. */
export async function setAutoEngagements(orgId: string, clientId: string, enabled: boolean): Promise<boolean | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .update(client)
      .set({ autoEngagements: enabled })
      .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
      .returning({ autoEngagements: client.autoEngagements });
    return rows[0] ? rows[0].autoEngagements : null;
  });
}

export type OpenOutcome =
  | { created: number; engagements: EngagementView[] }
  | { notFound: true }
  | { autoOff: true }
  | { noProfile: true }
  | { factsMissing: true };

export async function openForObligations(orgId: string, userId: string, clientId: string, now: Date): Promise<OpenOutcome> {
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

  return withOrg(orgId, async (tx): Promise<OpenOutcome> => {
    const row = await clientRow(tx, orgId, clientId);
    if (!row) return { notFound: true };
    if (!row.autoEngagements) return { autoOff: true };
    if (row.jurisdiction === 'AU+UK' || row.entityType === null) return { noProfile: true };
    const jurisdiction = row.jurisdiction;
    const profile: CalendarProfile = {
      jurisdiction,
      entityType: row.entityType,
      taxRegistered: row.taxRegistered,
      taxPeriod: row.taxPeriod,
      fyEndMonth: row.fyEndMonth,
      registeredOn: row.registeredOn,
      vatStaggerMonth: row.vatStaggerMonth,
      mtdItsa: row.mtdItsa,
    };
    const today = todayIn(row.timezone ?? defaultTimezone(jurisdiction), now);
    const obligations = obligationsFor(profile, rules, today, addDays(today, OPEN_WINDOW_DAYS));
    const firm = await firmTemplateRefs(tx, orgId);
    const drafts = engagementDraftsFor(obligations, (k) => templateFor(k, jurisdiction, firm, ENGAGEMENT_TEMPLATES.templates));

    let created = 0;
    for (const d of drafts) {
      const ins = await tx
        .insert(engagement)
        .values({
          orgId,
          clientId,
          templateId: d.templateId,
          title: d.title,
          kind: d.kind,
          periodEnd: d.periodEnd,
          dueOn: d.dueOn,
          obligationId: d.obligationId,
          createdBy: userId,
        })
        .onConflictDoNothing({ target: [engagement.clientId, engagement.obligationId] })
        .returning({ id: engagement.id });
      const id = ins[0]?.id;
      if (!id) continue;
      created += 1;
      if (d.steps.length > 0) {
        await tx.insert(task).values(
          d.steps.map((s, i) => ({
            orgId,
            engagementId: id,
            title: s.title,
            position: i,
            estimateMinutes: s.estimateMinutes,
            status: 'todo' as const,
          })),
        );
      }
    }
    return { created, engagements: await selectViews(tx, orgId, eq(engagement.clientId, clientId)) };
  });
}

/** null when not in this firm. Sets only given fields plus updated_at = now(). */
export async function updateEngagement(orgId: string, id: string, patch: EngagementPatch): Promise<EngagementView | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .update(engagement)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.dueOn !== undefined ? { dueOn: patch.dueOn } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(engagement.id, id), eq(engagement.orgId, orgId)))
      .returning({ id: engagement.id });
    if (!rows[0]) return null;
    return oneView(tx, orgId, id);
  });
}

/** false when not in this firm. Tasks go by ON DELETE CASCADE. */
export async function deleteEngagement(orgId: string, id: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .delete(engagement)
      .where(and(eq(engagement.id, id), eq(engagement.orgId, orgId)))
      .returning({ id: engagement.id });
    return rows.length > 0;
  });
}

/** This firm's members joined to user, ordered by user.name asc, then email asc. */
export async function listMembers(orgId: string): Promise<MemberView[]> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({ userId: user.id, name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, orgId))
      .orderBy(asc(user.name), asc(user.email));
    return rows;
  });
}
