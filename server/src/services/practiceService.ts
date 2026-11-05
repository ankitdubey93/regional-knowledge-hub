// A1: the practice-data menu. Every tenant query runs inside withOrg and keeps an explicit org_id predicate (Hard rule 11). Read only. Never logs a name or label (Hard rule 13).
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { Fact } from '@chub/shared/data/schemas';
import type { PracticeKind } from '@chub/shared/lib/chatWire';
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
import {
  PRACTICE_DUE_DAYS,
  PRACTICE_LINE_CAP,
  type DueSoonRow,
  type EngagementRow,
  type PracticeData,
  type RequestRow,
  type UnbilledRow,
} from '../chat/practiceSources';
import { db } from '../db/client';
import { client, documentRequest, engagement, kbFact, timeEntry } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { rowToFact } from './kbService';
import { getWorkload } from './workloadService';

export async function practiceChatData(orgId: string, kinds: PracticeKind[], clientId: string | null, now: Date): Promise<PracticeData> {
  const data: PracticeData = { clientId, dueSoon: null, capacity: null, unbilled: null, engagements: null, requests: null };
  const want = new Set(kinds);

  // kb_fact is global, so it is read outside withOrg.
  let rules: DeadlineRules | null = null;
  let byKey: Record<string, Fact> = {};
  if (want.has('due_soon')) {
    const factRows = await db.select().from(kbFact).where(inArray(kbFact.key, [...DEADLINE_FACT_KEYS]));
    byKey = {};
    for (const r of factRows) byKey[r.key] = rowToFact(r);
    try {
      rules = deadlineRulesFrom((k) => byKey[k]);
    } catch (e) {
      if (e instanceof TypeError) {
        data.dueSoon = { days: PRACTICE_DUE_DAYS, factsMissing: true, rows: [], noProfile: [] };
      } else {
        throw e;
      }
    }
  }

  const needsClients = want.has('due_soon') || want.has('unbilled_time') || want.has('open_engagements') || want.has('outstanding_requests');
  if (needsClients) {
    const found = await withOrg(orgId, async (tx) => {
      const clients = await tx
        .select()
        .from(client)
        .where(clientId === null ? eq(client.orgId, orgId) : and(eq(client.orgId, orgId), eq(client.id, clientId)))
        .orderBy(asc(client.name));
      if (clientId !== null && clients.length === 0) return null;
      const nameOf = new Map<string, string>();
      const todayOf = new Map<string, string>();
      for (const c of clients) {
        nameOf.set(c.id, c.name);
        todayOf.set(c.id, todayIn(c.timezone ?? defaultTimezone(c.jurisdiction), now));
      }
      const nameFor = (id: string): string => nameOf.get(id) ?? '';
      const overdueFor = (id: string, day: string | null): boolean => {
        const today = todayOf.get(id);
        return day !== null && today !== undefined && day < today;
      };

      const out: Pick<PracticeData, 'unbilled' | 'engagements' | 'requests'> & { dueSoon: PracticeData['dueSoon'] } = {
        dueSoon: null,
        unbilled: null,
        engagements: null,
        requests: null,
      };

      if (want.has('due_soon') && rules !== null) {
        const rows: DueSoonRow[] = [];
        const noProfile: string[] = [];
        for (const c of clients) {
          if (c.jurisdiction === 'AU+UK' || c.entityType === null) {
            noProfile.push(c.name);
            continue;
          }
          const profile: CalendarProfile = {
            jurisdiction: c.jurisdiction,
            entityType: c.entityType,
            taxRegistered: c.taxRegistered,
            taxPeriod: c.taxPeriod,
            fyEndMonth: c.fyEndMonth,
            registeredOn: c.registeredOn,
            vatStaggerMonth: c.vatStaggerMonth,
            mtdItsa: c.mtdItsa,
          };
          const today = todayOf.get(c.id) ?? todayIn(defaultTimezone(c.jurisdiction), now);
          for (const o of obligationsFor(profile, rules, today, addDays(today, PRACTICE_DUE_DAYS))) {
            rows.push({
              clientName: c.name,
              label: o.label,
              dueDate: o.dueDate,
              ruleChecked: o.factKeys.every((k) => byKey[k]?.verifiedOn != null),
            });
          }
        }
        const lt = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
        rows.sort((a, b) => lt(a.dueDate, b.dueDate) || lt(a.clientName, b.clientName) || lt(a.label, b.label));
        out.dueSoon = { days: PRACTICE_DUE_DAYS, factsMissing: false, rows, noProfile };
      }

      if (want.has('unbilled_time')) {
        const agg = await tx
          .select({
            clientId: timeEntry.clientId,
            minutes: sql<number>`sum(${timeEntry.minutes})::int`,
            entries: sql<number>`count(*)::int`,
            oldest: sql<string>`min(${timeEntry.workDate})::text`,
          })
          .from(timeEntry)
          .where(
            and(
              eq(timeEntry.orgId, orgId),
              isNull(timeEntry.invoiceId),
              isNotNull(timeEntry.minutes),
              eq(timeEntry.billable, true),
              clientId === null ? undefined : eq(timeEntry.clientId, clientId),
            ),
          )
          .groupBy(timeEntry.clientId);
        const rows: UnbilledRow[] = agg.map((a) => ({
          clientName: nameFor(a.clientId),
          minutes: a.minutes,
          entries: a.entries,
          oldestWorkDate: a.oldest,
        }));
        rows.sort((a, b) => b.minutes - a.minutes || (a.clientName < b.clientName ? -1 : a.clientName > b.clientName ? 1 : 0));
        out.unbilled = rows.slice(0, PRACTICE_LINE_CAP + 1);
      }

      if (want.has('open_engagements')) {
        const rows = await tx
          .select({
            clientId: engagement.clientId,
            title: engagement.title,
            status: engagement.status,
            dueOn: engagement.dueOn,
            tasksTotal: sql<number>`(select count(*)::int from task t where t.engagement_id = ${engagement.id} and t.org_id = ${orgId})`,
            tasksDone: sql<number>`(select count(*)::int from task t where t.engagement_id = ${engagement.id} and t.org_id = ${orgId} and t.status = 'done')`,
          })
          .from(engagement)
          .where(
            and(
              eq(engagement.orgId, orgId),
              ne(engagement.status, 'done'),
              clientId === null ? undefined : eq(engagement.clientId, clientId),
            ),
          )
          .orderBy(asc(engagement.dueOn), asc(engagement.title))
          .limit(PRACTICE_LINE_CAP + 1);
        const mapped: EngagementRow[] = rows.map((r) => {
          if (r.status === 'done') throw new Error('done engagement in open list');
          return {
            clientName: nameFor(r.clientId),
            title: r.title,
            status: r.status,
            dueOn: r.dueOn,
            overdue: overdueFor(r.clientId, r.dueOn),
            tasksDone: r.tasksDone,
            tasksTotal: r.tasksTotal,
          };
        });
        out.engagements = mapped;
      }

      if (want.has('outstanding_requests')) {
        const rows = await tx
          .select({ clientId: documentRequest.clientId, label: documentRequest.label, dueOn: documentRequest.dueOn })
          .from(documentRequest)
          .where(
            and(
              eq(documentRequest.orgId, orgId),
              eq(documentRequest.status, 'open'),
              clientId === null ? undefined : eq(documentRequest.clientId, clientId),
            ),
          )
          .orderBy(sql`${documentRequest.dueOn} asc nulls last`, asc(documentRequest.label))
          .limit(PRACTICE_LINE_CAP + 1);
        const mapped: RequestRow[] = rows.map((r) => ({
          clientName: nameFor(r.clientId),
          label: r.label,
          dueOn: r.dueOn,
          overdue: overdueFor(r.clientId, r.dueOn),
        }));
        out.requests = mapped;
      }
      return out;
    });
    if (found === null) return data;
    if (found.dueSoon) data.dueSoon = found.dueSoon;
    data.unbilled = found.unbilled;
    data.engagements = found.engagements;
    data.requests = found.requests;
  }

  if (want.has('over_capacity') && clientId === null) {
    const w = await getWorkload(orgId, null, now);
    data.capacity = { weekStart: w.weekStart, nextWeekStart: w.nextWeekStart, rows: w.rows };
  }
  return data;
}
