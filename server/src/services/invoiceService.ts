// B2. Every tenant query runs inside withOrg and keeps an explicit org_id predicate (Hard rule 11).
// kb_fact is global and read before withOrg. Money is integer cents through the shared engine (Hard rule 3). Never logs invoice text (Hard rule 13).
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { addDays, formatDay } from '@chub/shared/utils/deadlines';
import {
  HOME_CURRENCY,
  MAX_LINES_PER_INVOICE,
  SCHEME_FACT_KEY,
  allowedTreatments,
  convertCents,
  formatInvoiceNumber,
  invoiceTotals,
  schemeFor,
  timeLineCents,
  type TaxScheme,
  type TaxTreatment,
} from '@chub/shared/utils/invoice';
import { invoiceToXeroCsv } from '@chub/shared/utils/invoiceCsv';
import type { Currency } from '@chub/shared/utils/money';
import { db } from '../db/client';
import {
  client,
  clientPricing,
  engagement,
  invoice,
  invoiceCounter,
  invoiceLine,
  kbFact,
  organization,
  rateCard,
  timeEntry,
  user,
} from '../db/schema';
import { withOrg, type Tx } from '../db/withOrg';
import { recordEvent, type AuditActor } from './auditEventService';
import type { FirmRole } from '../types';
import type {
  InvoiceCreate,
  InvoiceFilter,
  InvoiceLineView,
  InvoicePatch,
  InvoiceSeller,
  InvoiceSummary,
  InvoiceView,
  LineCreate,
  LinePatch,
} from '../types/invoices';

export interface InvoiceViewer {
  userId: string;
  role: FirmRole;
}

export type CreateOutcome =
  | { invoice: InvoiceView }
  | { noSettings: true }
  | { badClient: true }
  | { badEngagement: true }
  | { noPricing: true }
  | { needsEngagement: true }
  | { nothingToBill: true }
  | { noRate: { userName: string; currency: Currency } }
  | { tooManyLines: true }
  | { overLimit: true }
  | { conflict: true }
  | { factMissing: true };
export type EditOutcome =
  | { invoice: InvoiceView }
  | { notFound: true }
  | { lineNotFound: true }
  | { notDraft: true }
  | { badTreatment: true }
  | { timeAmount: true }
  | { fxNotNeeded: true }
  | { tooManyLines: true }
  | { overLimit: true };
export type DeleteDraftOutcome = { deleted: true } | { notFound: true } | { notDraft: true };

class ConflictError extends Error {}
class OverLimitError extends Error {}

type InvoiceRow = typeof invoice.$inferSelect;

/** The scheme's standard rate from kb_fact (global table, read outside withOrg). A null key means no tax. */
async function readRate(key: string | null): Promise<{ rateBp: number; verifiedOn: string | null } | null> {
  if (key === null) return { rateBp: 0, verifiedOn: null };
  const rows = await db.select().from(kbFact).where(eq(kbFact.key, key)).limit(1);
  const row = rows[0];
  if (!row || row.unit !== 'bp' || row.valueNum === null) return null;
  return { rateBp: row.valueNum, verifiedOn: row.verifiedOn };
}

function asJurisdiction(v: string | null): 'AU' | 'UK' | null {
  return v === 'AU' || v === 'UK' ? v : null;
}

async function selectView(tx: Tx, orgId: string, viewer: InvoiceViewer, id: string): Promise<InvoiceView | null> {
  const rows = await tx
    .select({
      inv: invoice,
      clientName: client.name,
      clientJurisdiction: client.jurisdiction,
      engagementTitle: engagement.title,
    })
    .from(invoice)
    .innerJoin(client, and(eq(client.id, invoice.clientId), eq(client.orgId, orgId)))
    .leftJoin(engagement, and(eq(engagement.id, invoice.engagementId), eq(engagement.orgId, orgId)))
    .where(and(eq(invoice.id, id), eq(invoice.orgId, orgId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const inv = r.inv;
  const lineRows = await tx
    .select()
    .from(invoiceLine)
    .where(and(eq(invoiceLine.invoiceId, id), eq(invoiceLine.orgId, orgId)))
    .orderBy(asc(invoiceLine.position));
  const orgRows = await tx.select().from(organization).where(eq(organization.id, orgId)).limit(1);
  const org = orgRows[0];
  if (!org) throw new Error('organization not found');
  let verifiedOn: string | null = null;
  if (inv.taxFactKey !== null) {
    const f = await tx.select({ verifiedOn: kbFact.verifiedOn }).from(kbFact).where(eq(kbFact.key, inv.taxFactKey)).limit(1);
    verifiedOn = f[0]?.verifiedOn ?? null;
  }
  const issuedOrVoid = inv.status !== 'draft';
  const seller: InvoiceSeller = issuedOrVoid
    ? {
        jurisdiction: asJurisdiction(inv.sellerJurisdiction),
        name: inv.sellerName,
        address: inv.sellerAddress,
        taxNumber: inv.sellerTaxNumber,
        paymentDetails: inv.paymentDetails ?? '',
      }
    : {
        jurisdiction: asJurisdiction(org.billingJurisdiction),
        name: org.billingLegalName,
        address: org.billingAddress,
        taxNumber: org.billingTaxNumber,
        paymentDetails: org.billingPaymentDetails,
      };
  const homeCurrency = seller.jurisdiction ? HOME_CURRENCY[seller.jurisdiction] : null;
  const isAdmin = viewer.role !== 'member';
  const lines: InvoiceLineView[] = lineRows.map((l) => ({
    id: l.id,
    position: l.position,
    kind: l.kind,
    description: l.description,
    timeEntryId: l.timeEntryId,
    minutes: l.minutes,
    unitCents: l.unitCents,
    amountCents: l.amountCents,
    taxTreatment: l.taxTreatment,
    taxCents: l.taxCents,
  }));
  return {
    id: inv.id,
    number: inv.number,
    displayNumber: inv.number === null ? null : formatInvoiceNumber(inv.number),
    status: inv.status,
    clientId: inv.clientId,
    clientName: r.clientName,
    clientJurisdiction: r.clientJurisdiction,
    buyerName: inv.buyerName ?? r.clientName,
    engagementId: inv.engagementId,
    engagementTitle: r.engagementTitle ?? null,
    currency: inv.currency,
    homeCurrency,
    needsFx: homeCurrency !== null && inv.currency !== homeCurrency && inv.taxScheme !== 'none',
    taxScheme: inv.taxScheme,
    taxFactKey: inv.taxFactKey,
    taxRateBp: inv.taxRateBp,
    rateFactVerifiedOn: verifiedOn,
    periodFrom: inv.periodFrom,
    periodTo: inv.periodTo,
    buyerAddress: inv.buyerAddress,
    buyerTaxNumber: inv.buyerTaxNumber,
    reference: inv.reference,
    notes: inv.notes,
    issuedOn: inv.issuedOn,
    dueOn: inv.dueOn,
    seller,
    subtotalCents: inv.subtotalCents,
    taxCents: inv.taxCents,
    totalCents: inv.totalCents,
    noTaxSubtotalCents: inv.noTaxSubtotalCents,
    fxRateMicros: inv.fxRateMicros,
    fxRateDate: inv.fxRateDate,
    fxRateSource: inv.fxRateSource,
    taxHomeCents: inv.taxHomeCents,
    totalHomeCents: inv.totalHomeCents,
    voidedAt: inv.voidedAt ? inv.voidedAt.toISOString() : null,
    voidReason: inv.voidReason,
    allowedTreatments: allowedTreatments(inv.taxScheme),
    canEdit: inv.status === 'draft',
    canIssue: inv.status === 'draft' && isAdmin,
    canVoid: inv.status === 'issued' && isAdmin,
    lines,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };
}

/** Recomputes every line's tax and the invoice totals. 'overLimit' writes nothing. */
async function recalc(
  tx: Tx,
  orgId: string,
  invoiceId: string,
  scheme: TaxScheme,
  rateBp: number,
): Promise<'ok' | 'overLimit'> {
  const lines = await tx
    .select({ id: invoiceLine.id, amountCents: invoiceLine.amountCents, taxTreatment: invoiceLine.taxTreatment, taxCents: invoiceLine.taxCents })
    .from(invoiceLine)
    .where(and(eq(invoiceLine.invoiceId, invoiceId), eq(invoiceLine.orgId, orgId)))
    .orderBy(asc(invoiceLine.position));
  let totals;
  try {
    totals = invoiceTotals(
      lines.map((l) => ({ amountCents: l.amountCents, treatment: l.taxTreatment })),
      scheme,
      rateBp,
    );
  } catch (e) {
    if (e instanceof RangeError) return 'overLimit';
    throw e;
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const tax = totals.lineTaxCents[i]!;
    if (line.taxCents !== tax) {
      await tx
        .update(invoiceLine)
        .set({ taxCents: tax })
        .where(and(eq(invoiceLine.id, line.id), eq(invoiceLine.orgId, orgId)));
    }
  }
  await tx
    .update(invoice)
    .set({
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      noTaxSubtotalCents: totals.noTaxSubtotalCents,
      taxRateBp: rateBp,
      updatedAt: sql`now()`,
    })
    .where(and(eq(invoice.id, invoiceId), eq(invoice.orgId, orgId)));
  return 'ok';
}

export async function listInvoices(orgId: string, filter: InvoiceFilter): Promise<InvoiceSummary[]> {
  const conds: SQL[] = [eq(invoice.orgId, orgId)];
  if (filter.status !== undefined) conds.push(eq(invoice.status, filter.status));
  if (filter.clientId !== undefined) conds.push(eq(invoice.clientId, filter.clientId));
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        clientId: invoice.clientId,
        clientName: client.name,
        currency: invoice.currency,
        totalCents: invoice.totalCents,
        issuedOn: invoice.issuedOn,
        dueOn: invoice.dueOn,
        createdAt: invoice.createdAt,
      })
      .from(invoice)
      .innerJoin(client, and(eq(client.id, invoice.clientId), eq(client.orgId, orgId)))
      .where(and(...conds))
      .orderBy(desc(invoice.createdAt), desc(invoice.id))
      .limit(500);
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      displayNumber: r.number === null ? null : formatInvoiceNumber(r.number),
      status: r.status,
      clientId: r.clientId,
      clientName: r.clientName,
      currency: r.currency,
      totalCents: r.totalCents,
      issuedOn: r.issuedOn,
      dueOn: r.dueOn,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

export async function getInvoice(orgId: string, viewer: InvoiceViewer, id: string): Promise<InvoiceView | null> {
  return withOrg(orgId, (tx) => selectView(tx, orgId, viewer, id));
}

export async function createDraft(orgId: string, viewer: InvoiceViewer, input: InvoiceCreate): Promise<CreateOutcome> {
  // (a) the firm's settings, in a short transaction.
  const settings = await withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({ j: organization.billingJurisdiction, reg: organization.billingTaxRegistered })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    return rows[0] ?? null;
  });
  const jurisdiction = asJurisdiction(settings?.j ?? null);
  if (settings === null || jurisdiction === null) return { noSettings: true };
  const scheme = schemeFor(jurisdiction, settings.reg);
  // (b) the rate, outside any transaction.
  const rate = await readRate(SCHEME_FACT_KEY[scheme]);
  if (rate === null) return { factMissing: true };

  try {
    return await withOrg(orgId, async (tx): Promise<CreateOutcome> => {
      // 1. client, pricing, engagement
      const c = await tx
        .select({ id: client.id })
        .from(client)
        .where(and(eq(client.id, input.clientId), eq(client.orgId, orgId)))
        .limit(1);
      if (c.length === 0) return { badClient: true };
      const pr = await tx
        .select()
        .from(clientPricing)
        .where(and(eq(clientPricing.clientId, input.clientId), eq(clientPricing.orgId, orgId)))
        .limit(1);
      const pricing = pr[0];
      if (!pricing) return { noPricing: true };
      let engagementTitle: string | null = null;
      if (input.engagementId !== null) {
        const e = await tx
          .select({ title: engagement.title })
          .from(engagement)
          .where(
            and(
              eq(engagement.id, input.engagementId),
              eq(engagement.orgId, orgId),
              eq(engagement.clientId, input.clientId),
            ),
          )
          .limit(1);
        if (e.length === 0) return { badEngagement: true };
        engagementTitle = e[0]!.title;
      }
      if (pricing.model === 'fixed' && input.engagementId === null) return { needsEngagement: true };

      // 2. unbilled entries
      const conds: SQL[] = [
        eq(timeEntry.orgId, orgId),
        eq(timeEntry.clientId, input.clientId),
        isNull(timeEntry.invoiceId),
        sql`${timeEntry.minutes} is not null`,
        eq(timeEntry.billable, true),
        sql`${timeEntry.workDate} between ${input.from} and ${input.to}`,
      ];
      if (input.engagementId !== null) conds.push(eq(timeEntry.engagementId, input.engagementId));
      const entries = await tx
        .select({
          id: timeEntry.id,
          userId: timeEntry.userId,
          userName: user.name,
          workDate: timeEntry.workDate,
          minutes: timeEntry.minutes,
          note: timeEntry.note,
          engagementTitle: engagement.title,
        })
        .from(timeEntry)
        .leftJoin(user, eq(user.id, timeEntry.userId))
        .leftJoin(engagement, and(eq(engagement.id, timeEntry.engagementId), eq(engagement.orgId, orgId)))
        .where(and(...conds))
        .orderBy(asc(timeEntry.workDate), asc(timeEntry.createdAt), asc(timeEntry.id))
        .limit(MAX_LINES_PER_INVOICE + 1)
        .for('update', { of: timeEntry });
      const cap = pricing.model === 'hourly' ? MAX_LINES_PER_INVOICE : MAX_LINES_PER_INVOICE - 1;
      if (entries.length > cap) return { tooManyLines: true };

      // 3. lines
      const treatment: TaxTreatment = scheme === 'none' ? 'outside' : 'standard';
      interface DraftLine {
        kind: 'time' | 'fixed' | 'retainer';
        description: string;
        timeEntryId: string | null;
        minutes: number | null;
        unitCents: number;
        amountCents: number;
      }
      const drafts: DraftLine[] = [];
      if (pricing.model === 'hourly') {
        if (entries.length === 0) return { nothingToBill: true };
        const cards = await tx
          .select({ userId: rateCard.userId, centsPerHour: rateCard.centsPerHour })
          .from(rateCard)
          .where(and(eq(rateCard.orgId, orgId), eq(rateCard.currency, pricing.currency)));
        const byUser = new Map<string, number>();
        let firmDefault: number | null = null;
        for (const card of cards) {
          if (card.userId === null) firmDefault = card.centsPerHour;
          else byUser.set(card.userId, card.centsPerHour);
        }
        for (const e of entries) {
          const rate1 = byUser.get(e.userId) ?? firmDefault;
          const userName = e.userName ?? 'Former member';
          if (rate1 === null) return { noRate: { userName, currency: pricing.currency } };
          const minutes = e.minutes;
          if (minutes === null) continue;
          const label = e.note !== '' ? e.note : (e.engagementTitle ?? 'Professional services');
          drafts.push({
            kind: 'time',
            description: `${label} (${userName}, ${formatDay(e.workDate)})`.slice(0, 500),
            timeEntryId: e.id,
            minutes,
            unitCents: rate1,
            amountCents: timeLineCents(minutes, rate1),
          });
        }
      } else if (pricing.model === 'fixed') {
        const fee = pricing.fixedCents ?? 0;
        drafts.push({
          kind: 'fixed',
          description: (engagementTitle ?? 'Fixed fee').slice(0, 500),
          timeEntryId: null,
          minutes: null,
          unitCents: fee,
          amountCents: fee,
        });
      } else {
        const fee = pricing.retainerCents ?? 0;
        drafts.push({
          kind: 'retainer',
          description: `Retainer ${formatDay(input.from)} to ${formatDay(input.to)}`,
          timeEntryId: null,
          minutes: null,
          unitCents: fee,
          amountCents: fee,
        });
      }

      // 4. totals
      let totals;
      try {
        totals = invoiceTotals(
          drafts.map((d) => ({ amountCents: d.amountCents, treatment })),
          scheme,
          rate.rateBp,
        );
      } catch (e) {
        if (e instanceof RangeError) return { overLimit: true };
        throw e;
      }

      // 5. insert
      const inserted = await tx
        .insert(invoice)
        .values({
          orgId,
          clientId: input.clientId,
          engagementId: input.engagementId,
          status: 'draft',
          currency: pricing.currency,
          taxScheme: scheme,
          taxFactKey: SCHEME_FACT_KEY[scheme],
          taxRateBp: rate.rateBp,
          periodFrom: input.from,
          periodTo: input.to,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          noTaxSubtotalCents: totals.noTaxSubtotalCents,
          createdBy: viewer.userId,
        })
        .returning({ id: invoice.id });
      const invoiceId = inserted[0]!.id;
      await tx.insert(invoiceLine).values(
        drafts.map((d, i) => ({
          orgId,
          invoiceId,
          position: i + 1,
          kind: d.kind,
          description: d.description,
          timeEntryId: d.timeEntryId,
          minutes: d.minutes,
          unitCents: d.unitCents,
          amountCents: d.amountCents,
          taxTreatment: treatment,
          taxCents: totals.lineTaxCents[i]!,
        })),
      );
      if (entries.length > 0) {
        const attached = await tx
          .update(timeEntry)
          .set({ invoiceId, updatedAt: sql`now()` })
          .where(
            and(
              eq(timeEntry.orgId, orgId),
              inArray(
                timeEntry.id,
                entries.map((e) => e.id),
              ),
              isNull(timeEntry.invoiceId),
            ),
          )
          .returning({ id: timeEntry.id });
        if (attached.length !== entries.length) throw new ConflictError();
      }
      const view = await selectView(tx, orgId, viewer, invoiceId);
      if (!view) throw new Error('invoice vanished');
      return { invoice: view };
    });
  } catch (e) {
    if (e instanceof ConflictError) return { conflict: true };
    throw e;
  }
}

/** Locks the invoice row. */
async function lockInvoice(tx: Tx, orgId: string, id: string): Promise<InvoiceRow | null> {
  const rows = await tx
    .select()
    .from(invoice)
    .where(and(eq(invoice.id, id), eq(invoice.orgId, orgId)))
    .for('update');
  return rows[0] ?? null;
}

async function finishEdit(tx: Tx, orgId: string, viewer: InvoiceViewer, id: string): Promise<EditOutcome> {
  const view = await selectView(tx, orgId, viewer, id);
  if (!view) return { notFound: true };
  return { invoice: view };
}

export async function updateDraft(
  orgId: string,
  viewer: InvoiceViewer,
  id: string,
  patch: InvoicePatch,
): Promise<EditOutcome> {
  return withOrg(orgId, async (tx): Promise<EditOutcome> => {
    const inv = await lockInvoice(tx, orgId, id);
    if (!inv) return { notFound: true };
    if (inv.status !== 'draft') return { notDraft: true };
    if (patch.fx !== undefined && patch.fx !== null) {
      const o = await tx
        .select({ j: organization.billingJurisdiction })
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1);
      const j = asJurisdiction(o[0]?.j ?? null);
      if (j === null || inv.currency === HOME_CURRENCY[j]) return { fxNotNeeded: true };
    }
    await tx
      .update(invoice)
      .set({
        ...(patch.buyerAddress !== undefined ? { buyerAddress: patch.buyerAddress } : {}),
        ...(patch.buyerTaxNumber !== undefined ? { buyerTaxNumber: patch.buyerTaxNumber } : {}),
        ...(patch.reference !== undefined ? { reference: patch.reference } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.fx === null ? { fxRateMicros: null, fxRateDate: null, fxRateSource: null } : {}),
        ...(patch.fx !== undefined && patch.fx !== null
          ? { fxRateMicros: patch.fx.rateMicros, fxRateDate: patch.fx.date, fxRateSource: patch.fx.source }
          : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(invoice.id, id), eq(invoice.orgId, orgId)));
    return finishEdit(tx, orgId, viewer, id);
  });
}

export async function addLine(
  orgId: string,
  viewer: InvoiceViewer,
  id: string,
  input: LineCreate,
): Promise<EditOutcome> {
  try {
    return await withOrg(orgId, async (tx): Promise<EditOutcome> => {
      const inv = await lockInvoice(tx, orgId, id);
      if (!inv) return { notFound: true };
      if (inv.status !== 'draft') return { notDraft: true };
      if (!allowedTreatments(inv.taxScheme).includes(input.taxTreatment)) return { badTreatment: true };
      const agg = await tx
        .select({ n: sql<number>`count(*)::int`, max: sql<number>`coalesce(max(${invoiceLine.position}), 0)::int` })
        .from(invoiceLine)
        .where(and(eq(invoiceLine.invoiceId, id), eq(invoiceLine.orgId, orgId)));
      const count = agg[0]?.n ?? 0;
      const maxPos = agg[0]?.max ?? 0;
      if (count >= MAX_LINES_PER_INVOICE) return { tooManyLines: true };
      await tx.insert(invoiceLine).values({
        orgId,
        invoiceId: id,
        position: maxPos + 1,
        kind: 'manual',
        description: input.description,
        timeEntryId: null,
        minutes: null,
        unitCents: input.amountCents,
        amountCents: input.amountCents,
        taxTreatment: input.taxTreatment,
        taxCents: 0,
      });
      if ((await recalc(tx, orgId, id, inv.taxScheme, inv.taxRateBp)) === 'overLimit') throw new OverLimitError();
      return finishEdit(tx, orgId, viewer, id);
    });
  } catch (e) {
    if (e instanceof OverLimitError) return { overLimit: true };
    throw e;
  }
}

export async function updateLine(
  orgId: string,
  viewer: InvoiceViewer,
  id: string,
  lineId: string,
  patch: LinePatch,
): Promise<EditOutcome> {
  try {
    return await withOrg(orgId, async (tx): Promise<EditOutcome> => {
      const inv = await lockInvoice(tx, orgId, id);
      if (!inv) return { notFound: true };
      if (inv.status !== 'draft') return { notDraft: true };
      const found = await tx
        .select()
        .from(invoiceLine)
        .where(and(eq(invoiceLine.id, lineId), eq(invoiceLine.invoiceId, id), eq(invoiceLine.orgId, orgId)))
        .limit(1);
      const line = found[0];
      if (!line) return { lineNotFound: true };
      if (patch.taxTreatment !== undefined && !allowedTreatments(inv.taxScheme).includes(patch.taxTreatment)) {
        return { badTreatment: true };
      }
      if (patch.amountCents !== undefined && line.kind === 'time') return { timeAmount: true };
      await tx
        .update(invoiceLine)
        .set({
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.taxTreatment !== undefined ? { taxTreatment: patch.taxTreatment } : {}),
          ...(patch.amountCents !== undefined ? { amountCents: patch.amountCents, unitCents: patch.amountCents } : {}),
        })
        .where(and(eq(invoiceLine.id, lineId), eq(invoiceLine.orgId, orgId)));
      if ((await recalc(tx, orgId, id, inv.taxScheme, inv.taxRateBp)) === 'overLimit') throw new OverLimitError();
      return finishEdit(tx, orgId, viewer, id);
    });
  } catch (e) {
    if (e instanceof OverLimitError) return { overLimit: true };
    throw e;
  }
}

export async function deleteLine(
  orgId: string,
  viewer: InvoiceViewer,
  id: string,
  lineId: string,
): Promise<EditOutcome> {
  return withOrg(orgId, async (tx): Promise<EditOutcome> => {
    const inv = await lockInvoice(tx, orgId, id);
    if (!inv) return { notFound: true };
    if (inv.status !== 'draft') return { notDraft: true };
    const found = await tx
      .select({ id: invoiceLine.id, timeEntryId: invoiceLine.timeEntryId })
      .from(invoiceLine)
      .where(and(eq(invoiceLine.id, lineId), eq(invoiceLine.invoiceId, id), eq(invoiceLine.orgId, orgId)))
      .limit(1);
    const line = found[0];
    if (!line) return { lineNotFound: true };
    if (line.timeEntryId !== null) {
      await tx
        .update(timeEntry)
        .set({ invoiceId: null, updatedAt: sql`now()` })
        .where(and(eq(timeEntry.orgId, orgId), eq(timeEntry.id, line.timeEntryId), eq(timeEntry.invoiceId, id)));
    }
    await tx.delete(invoiceLine).where(and(eq(invoiceLine.id, lineId), eq(invoiceLine.orgId, orgId)));
    // Deleting lines only lowers the totals, so recalc cannot exceed a limit that held before.
    await recalc(tx, orgId, id, inv.taxScheme, inv.taxRateBp);
    return finishEdit(tx, orgId, viewer, id);
  });
}

export async function deleteDraft(orgId: string, id: string): Promise<DeleteDraftOutcome> {
  return withOrg(orgId, async (tx): Promise<DeleteDraftOutcome> => {
    const inv = await lockInvoice(tx, orgId, id);
    if (!inv) return { notFound: true };
    if (inv.status !== 'draft') return { notDraft: true };
    await tx.delete(invoice).where(and(eq(invoice.id, id), eq(invoice.orgId, orgId)));
    return { deleted: true };
  });
}

export type IssueOutcome =
  | { invoice: InvoiceView }
  | { notFound: true }
  | { notDraft: true }
  | { noLines: true }
  | { incompleteSettings: true }
  | { schemeChanged: true }
  | { needsBuyerAddress: true }
  | { needsFx: true; homeCurrency: Currency }
  | { factMissing: true }
  | { overLimit: true };
export type VoidOutcome = { invoice: InvoiceView } | { notFound: true } | { notIssued: true };
export type CsvOutcome = { csv: string; filename: string } | { notFound: true } | { notIssued: true };

export async function issueInvoice(
  orgId: string,
  actor: AuditActor,
  viewer: InvoiceViewer,
  id: string,
  input: { issuedOn: string },
): Promise<IssueOutcome> {
  // (a) the invoice's fact key, in a short transaction.
  const head = await withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({ key: invoice.taxFactKey })
      .from(invoice)
      .where(and(eq(invoice.id, id), eq(invoice.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (head === null) return { notFound: true };
  // (b) the rate, outside any transaction.
  const rate = await readRate(head.key);
  if (rate === null) return { factMissing: true };

  try {
    return await withOrg(orgId, async (tx): Promise<IssueOutcome> => {
      // 1. lock
      const inv = await lockInvoice(tx, orgId, id);
      if (!inv) return { notFound: true };
      if (inv.status !== 'draft') return { notDraft: true };
      const lineCount = await tx
        .select({ id: invoiceLine.id })
        .from(invoiceLine)
        .where(and(eq(invoiceLine.invoiceId, id), eq(invoiceLine.orgId, orgId)))
        .limit(1);
      if (lineCount.length === 0) return { noLines: true };
      // 2. settings
      const orgRows = await tx.select().from(organization).where(eq(organization.id, orgId)).limit(1);
      const org = orgRows[0];
      const jurisdiction = asJurisdiction(org?.billingJurisdiction ?? null);
      if (!org || jurisdiction === null || org.billingLegalName === null || org.billingAddress === null) {
        return { incompleteSettings: true };
      }
      if (schemeFor(jurisdiction, org.billingTaxRegistered) !== inv.taxScheme) return { schemeChanged: true };
      // 3. buyer address (UK VAT)
      if (inv.taxScheme === 'uk_vat' && inv.buyerAddress === '') return { needsBuyerAddress: true };
      // 4. FX
      if (inv.taxScheme !== 'none' && inv.currency !== HOME_CURRENCY[jurisdiction] && inv.fxRateMicros === null) {
        return { needsFx: true, homeCurrency: HOME_CURRENCY[jurisdiction] };
      }
      // 5. totals with the current rate
      if ((await recalc(tx, orgId, id, inv.taxScheme, rate.rateBp)) === 'overLimit') throw new OverLimitError();
      // 6. the number: the last write that can fail before the status update
      const counter = await tx
        .insert(invoiceCounter)
        .values({ orgId, nextNumber: 2 })
        .onConflictDoUpdate({
          target: invoiceCounter.orgId,
          set: { nextNumber: sql`"invoice_counter"."next_number" + 1` },
        })
        .returning({ next: invoiceCounter.nextNumber });
      const number = counter[0]!.next - 1;
      // 7. totals and home-currency amounts
      const fresh = await tx
        .select({ taxCents: invoice.taxCents, totalCents: invoice.totalCents })
        .from(invoice)
        .where(and(eq(invoice.id, id), eq(invoice.orgId, orgId)))
        .limit(1);
      const totals = fresh[0]!;
      const taxHomeCents = inv.fxRateMicros !== null ? convertCents(totals.taxCents, inv.fxRateMicros) : null;
      const totalHomeCents = inv.fxRateMicros !== null ? convertCents(totals.totalCents, inv.fxRateMicros) : null;
      const clientRows = await tx
        .select({ name: client.name })
        .from(client)
        .where(and(eq(client.id, inv.clientId), eq(client.orgId, orgId)))
        .limit(1);
      // 8. issue
      await tx
        .update(invoice)
        .set({
          status: 'issued',
          number,
          issuedOn: input.issuedOn,
          dueOn: addDays(input.issuedOn, org.billingPaymentDays),
          sellerJurisdiction: jurisdiction,
          sellerName: org.billingLegalName,
          sellerAddress: org.billingAddress,
          sellerTaxNumber: org.billingTaxNumber,
          buyerName: clientRows[0]?.name ?? '',
          paymentDetails: org.billingPaymentDetails,
          taxHomeCents,
          totalHomeCents,
          issuedBy: viewer.userId,
          updatedAt: sql`now()`,
        })
        .where(and(eq(invoice.id, id), eq(invoice.orgId, orgId)));
      // 9. audit
      await recordEvent(tx, {
        orgId,
        actorId: actor.userId,
        action: 'invoice.issue',
        targetType: 'invoice',
        targetId: id,
        ipKey: actor.ipKey,
        detail: { number, totalCents: totals.totalCents },
      });
      // 10. view
      const view = await selectView(tx, orgId, viewer, id);
      if (!view) throw new Error('invoice vanished');
      return { invoice: view };
    });
  } catch (e) {
    if (e instanceof OverLimitError) return { overLimit: true };
    throw e;
  }
}

export async function voidInvoice(
  orgId: string,
  actor: AuditActor,
  viewer: InvoiceViewer,
  id: string,
  input: { reason: string },
): Promise<VoidOutcome> {
  return withOrg(orgId, async (tx): Promise<VoidOutcome> => {
    const inv = await lockInvoice(tx, orgId, id);
    if (!inv) return { notFound: true };
    if (inv.status !== 'issued') return { notIssued: true };
    await tx
      .update(invoice)
      .set({ status: 'void', voidedAt: sql`now()`, voidReason: input.reason, updatedAt: sql`now()` })
      .where(and(eq(invoice.id, id), eq(invoice.orgId, orgId)));
    await tx
      .update(timeEntry)
      .set({ invoiceId: null, updatedAt: sql`now()` })
      .where(and(eq(timeEntry.orgId, orgId), eq(timeEntry.invoiceId, id)));
    await recordEvent(tx, {
      orgId,
      actorId: actor.userId,
      action: 'invoice.void',
      targetType: 'invoice',
      targetId: id,
      ipKey: actor.ipKey,
      detail: { number: inv.number },
    });
    const view = await selectView(tx, orgId, viewer, id);
    if (!view) throw new Error('invoice vanished');
    return { invoice: view };
  });
}

export async function invoiceCsv(orgId: string, id: string): Promise<CsvOutcome> {
  return withOrg(orgId, async (tx): Promise<CsvOutcome> => {
    const rows = await tx
      .select()
      .from(invoice)
      .where(and(eq(invoice.id, id), eq(invoice.orgId, orgId)))
      .limit(1);
    const inv = rows[0];
    if (!inv) return { notFound: true };
    if (inv.status !== 'issued' || inv.number === null || inv.issuedOn === null || inv.dueOn === null) {
      return { notIssued: true };
    }
    const jurisdiction = asJurisdiction(inv.sellerJurisdiction);
    if (jurisdiction === null) return { notIssued: true };
    const orgRows = await tx
      .select({ accountCode: organization.billingAccountCode })
      .from(organization)
      .where(eq(organization.id, orgId))
      .limit(1);
    const lines = await tx
      .select()
      .from(invoiceLine)
      .where(and(eq(invoiceLine.invoiceId, id), eq(invoiceLine.orgId, orgId)))
      .orderBy(asc(invoiceLine.position));
    const displayNumber = formatInvoiceNumber(inv.number);
    const csv = invoiceToXeroCsv({
      contactName: inv.buyerName ?? '',
      address: inv.buyerAddress,
      displayNumber,
      reference: inv.reference,
      issuedOn: inv.issuedOn,
      dueOn: inv.dueOn,
      currency: inv.currency,
      accountCode: orgRows[0]?.accountCode ?? '200',
      jurisdiction,
      lines: lines.map((l) => ({
        description: l.description,
        amountCents: l.amountCents,
        taxCents: l.taxCents,
        taxTreatment: l.taxTreatment,
      })),
    });
    return { csv, filename: `${displayNumber}.csv` };
  });
}
