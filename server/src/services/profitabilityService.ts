// B3. Every tenant query runs inside one withOrg and keeps an explicit org_id predicate (Hard rule 11). The arithmetic is the shared engine's (Hard rule 3). Reads only; never logs names.
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { HOME_CURRENCY } from '@chub/shared/utils/invoice';
import type { Currency } from '@chub/shared/utils/money';
import {
  MAX_PROFIT_INVOICES,
  profitReport,
  type ProfitEntry,
  type ProfitInput,
} from '@chub/shared/utils/profitability';
import { client, engagement, invoice, invoiceLine, organization, rateCard, timeEntry } from '../db/schema';
import { withOrg } from '../db/withOrg';
import type { ProfitQuery, ProfitReportView } from '../types/profitability';

export type ProfitOutcome = { report: ProfitReportView } | { tooMany: true };

export async function profitabilityReport(orgId: string, query: ProfitQuery): Promise<ProfitOutcome> {
  return withOrg(orgId, async (tx): Promise<ProfitOutcome> => {
    let currency: Currency;
    if (query.currency) {
      currency = query.currency;
    } else {
      const orgRows = await tx
        .select({ j: organization.billingJurisdiction })
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1);
      const j = orgRows[0]?.j;
      currency = j === 'AU' || j === 'UK' ? HOME_CURRENCY[j] : 'AUD';
    }

    const invoices = await tx
      .select({
        id: invoice.id,
        clientId: invoice.clientId,
        engagementId: invoice.engagementId,
        subtotalCents: invoice.subtotalCents,
      })
      .from(invoice)
      .where(
        and(
          eq(invoice.orgId, orgId),
          eq(invoice.status, 'issued'),
          eq(invoice.currency, currency),
          sql`${invoice.issuedOn} between ${query.from} and ${query.to}`,
        ),
      )
      .orderBy(asc(invoice.id))
      .limit(MAX_PROFIT_INVOICES + 1);
    if (invoices.length > MAX_PROFIT_INVOICES) return { tooMany: true };
    if (invoices.length === 0) {
      return { report: { currency, from: query.from, to: query.to, entities: [] } };
    }
    const ids = invoices.map((i) => i.id);

    const lines = await tx
      .select({
        invoiceId: invoiceLine.invoiceId,
        kind: invoiceLine.kind,
        amountCents: invoiceLine.amountCents,
        entryEngagementId: timeEntry.engagementId,
      })
      .from(invoiceLine)
      .leftJoin(timeEntry, and(eq(timeEntry.id, invoiceLine.timeEntryId), eq(timeEntry.orgId, orgId)))
      .where(and(eq(invoiceLine.orgId, orgId), inArray(invoiceLine.invoiceId, ids)));

    const entryRows = await tx
      .select({
        invoiceId: timeEntry.invoiceId,
        engagementId: timeEntry.engagementId,
        userId: timeEntry.userId,
        minutes: timeEntry.minutes,
      })
      .from(timeEntry)
      .where(and(eq(timeEntry.orgId, orgId), inArray(timeEntry.invoiceId, ids), sql`${timeEntry.minutes} is not null`));
    const entries: ProfitEntry[] = [];
    for (const e of entryRows) {
      if (e.invoiceId === null || e.minutes === null) continue;
      entries.push({ invoiceId: e.invoiceId, engagementId: e.engagementId, userId: e.userId, minutes: e.minutes });
    }

    const rates = await tx
      .select({
        userId: rateCard.userId,
        centsPerHour: rateCard.centsPerHour,
        costCentsPerHour: rateCard.costCentsPerHour,
      })
      .from(rateCard)
      .where(and(eq(rateCard.orgId, orgId), eq(rateCard.currency, currency)));

    const clientIds = [...new Set(invoices.map((i) => i.clientId))];
    const clientRows = await tx
      .select({ id: client.id, name: client.name })
      .from(client)
      .where(and(eq(client.orgId, orgId), inArray(client.id, clientIds)));
    const clientNames: Record<string, string> = {};
    for (const c of clientRows) clientNames[c.id] = c.name;

    const engagementIds = new Set<string>();
    for (const i of invoices) if (i.engagementId !== null) engagementIds.add(i.engagementId);
    for (const l of lines) if (l.entryEngagementId !== null) engagementIds.add(l.entryEngagementId);
    for (const e of entries) if (e.engagementId !== null) engagementIds.add(e.engagementId);
    const engagementTitles: Record<string, string> = {};
    if (engagementIds.size > 0) {
      const rows = await tx
        .select({ id: engagement.id, title: engagement.title })
        .from(engagement)
        .where(and(eq(engagement.orgId, orgId), inArray(engagement.id, [...engagementIds])));
      for (const r of rows) engagementTitles[r.id] = r.title;
    }

    const input: ProfitInput = { invoices, lines, entries, rates, clientNames, engagementTitles };
    return { report: { currency, from: query.from, to: query.to, entities: profitReport(input) } };
  });
}
