// Every tenant query runs inside withOrg and keeps an explicit org_id predicate (Hard rule 11).
// organization is Better Auth's table (no RLS); it is still read and written inside withOrg so the drafts check and the update commit together.
// Never logs names, addresses or tax numbers (Hard rule 13).
import { and, eq, isNull } from 'drizzle-orm';
import {
  HOME_CURRENCY,
  normaliseTaxNumber,
  schemeFor,
  taxNumberProblem,
  type BillingJurisdiction,
} from '@chub/shared/utils/invoice';
import { client, clientPricing, invoice, member, organization, rateCard, user } from '../db/schema';
import { withOrg, type Tx } from '../db/withOrg';
import type {
  BillingSettingsPatch,
  BillingSettingsView,
  PricingSet,
  PricingView,
  RateCardView,
  RateSet,
} from '../types/billing';
import { listMembers } from './engagementService';

export type SettingsOutcome = { settings: BillingSettingsView } | { problem: string } | { draftsExist: true };
export type RateOutcome = { rates: RateCardView[] } | { notMember: true };

type OrgRow = typeof organization.$inferSelect;

function toView(row: OrgRow): BillingSettingsView {
  const jurisdiction = row.billingJurisdiction === 'AU' || row.billingJurisdiction === 'UK' ? row.billingJurisdiction : null;
  return {
    jurisdiction,
    legalName: row.billingLegalName,
    address: row.billingAddress,
    taxRegistered: row.billingTaxRegistered,
    taxNumber: row.billingTaxNumber,
    paymentDays: row.billingPaymentDays,
    paymentDetails: row.billingPaymentDetails,
    accountCode: row.billingAccountCode,
    scheme: jurisdiction === null ? null : schemeFor(jurisdiction, row.billingTaxRegistered),
    homeCurrency: jurisdiction === null ? null : HOME_CURRENCY[jurisdiction],
  };
}

export async function getBillingSettings(orgId: string): Promise<BillingSettingsView> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx.select().from(organization).where(eq(organization.id, orgId)).limit(1);
    const row = rows[0];
    if (!row) throw new Error('organization not found');
    return toView(row);
  });
}

export async function updateBillingSettings(orgId: string, patch: BillingSettingsPatch): Promise<SettingsOutcome> {
  return withOrg(orgId, async (tx): Promise<SettingsOutcome> => {
    const rows = await tx.select().from(organization).where(eq(organization.id, orgId)).for('update');
    const current = rows[0];
    if (!current) throw new Error('organization not found');

    const jurisdiction: BillingJurisdiction | null =
      patch.jurisdiction !== undefined
        ? patch.jurisdiction
        : current.billingJurisdiction === 'AU' || current.billingJurisdiction === 'UK'
          ? current.billingJurisdiction
          : null;
    const taxRegistered = patch.taxRegistered ?? current.billingTaxRegistered;
    const taxNumber: string | null =
      patch.taxNumber !== undefined
        ? patch.taxNumber === null
          ? null
          : normaliseTaxNumber(patch.taxNumber)
        : current.billingTaxNumber;

    if (taxRegistered && jurisdiction === null) return { problem: 'Choose your country before turning on tax registration' };
    if (taxRegistered && taxNumber === null) return { problem: 'Enter your ABN or VAT number' };
    if (taxNumber !== null && jurisdiction === null) return { problem: 'Choose your country before entering a tax number' };
    if (taxNumber !== null && jurisdiction !== null) {
      const problem = taxNumberProblem(jurisdiction, taxNumber);
      if (problem !== null) return { problem };
    }

    const currentJurisdiction = current.billingJurisdiction;
    if (jurisdiction !== currentJurisdiction || taxRegistered !== current.billingTaxRegistered) {
      const drafts = await tx
        .select({ id: invoice.id })
        .from(invoice)
        .where(and(eq(invoice.orgId, orgId), eq(invoice.status, 'draft')))
        .limit(1);
      if (drafts.length > 0) return { draftsExist: true };
    }

    const updated = await tx
      .update(organization)
      .set({
        ...(patch.jurisdiction !== undefined ? { billingJurisdiction: patch.jurisdiction } : {}),
        ...(patch.legalName !== undefined ? { billingLegalName: patch.legalName } : {}),
        ...(patch.address !== undefined ? { billingAddress: patch.address } : {}),
        ...(patch.taxRegistered !== undefined ? { billingTaxRegistered: patch.taxRegistered } : {}),
        ...(patch.taxNumber !== undefined ? { billingTaxNumber: taxNumber } : {}),
        ...(patch.paymentDays !== undefined ? { billingPaymentDays: patch.paymentDays } : {}),
        ...(patch.paymentDetails !== undefined ? { billingPaymentDetails: patch.paymentDetails } : {}),
        ...(patch.accountCode !== undefined ? { billingAccountCode: patch.accountCode } : {}),
      })
      .where(eq(organization.id, orgId))
      .returning();
    const row = updated[0];
    if (!row) throw new Error('organization not found');
    return { settings: toView(row) };
  });
}

async function selectRates(tx: Tx, orgId: string): Promise<RateCardView[]> {
  const rows = await tx
    .select({
      userId: rateCard.userId,
      userName: user.name,
      currency: rateCard.currency,
      centsPerHour: rateCard.centsPerHour,
    })
    .from(rateCard)
    .leftJoin(user, eq(user.id, rateCard.userId))
    .where(eq(rateCard.orgId, orgId));
  const views: RateCardView[] = rows.map((r) => ({
    userId: r.userId,
    userName: r.userId === null ? 'Firm default' : (r.userName ?? 'Former member'),
    currency: r.currency,
    centsPerHour: r.centsPerHour,
  }));
  views.sort((a, b) => {
    if ((a.userId === null) !== (b.userId === null)) return a.userId === null ? -1 : 1;
    if (a.userName !== b.userName) return a.userName < b.userName ? -1 : 1;
    return a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0;
  });
  return views;
}

export async function listRates(
  orgId: string,
): Promise<{ rates: RateCardView[]; members: { userId: string; name: string }[] }> {
  const rates = await withOrg(orgId, (tx) => selectRates(tx, orgId));
  const members = (await listMembers(orgId)).map((m) => ({ userId: m.userId, name: m.name }));
  return { rates, members };
}

export async function setRate(orgId: string, input: RateSet): Promise<RateOutcome> {
  return withOrg(orgId, async (tx): Promise<RateOutcome> => {
    if (input.userId !== null) {
      const m = await tx
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.organizationId, orgId), eq(member.userId, input.userId)))
        .limit(1);
      if (m.length === 0) return { notMember: true };
    }
    const existing = await tx
      .select({ id: rateCard.id })
      .from(rateCard)
      .where(
        and(
          eq(rateCard.orgId, orgId),
          input.userId === null ? isNull(rateCard.userId) : eq(rateCard.userId, input.userId),
          eq(rateCard.currency, input.currency),
        ),
      )
      .for('update');
    const found = existing[0];
    if (input.centsPerHour === null) {
      if (found) await tx.delete(rateCard).where(and(eq(rateCard.id, found.id), eq(rateCard.orgId, orgId)));
    } else if (found) {
      await tx
        .update(rateCard)
        .set({ centsPerHour: input.centsPerHour, updatedAt: new Date() })
        .where(and(eq(rateCard.id, found.id), eq(rateCard.orgId, orgId)));
    } else {
      await tx.insert(rateCard).values({
        orgId,
        userId: input.userId,
        currency: input.currency,
        centsPerHour: input.centsPerHour,
      });
    }
    return { rates: await selectRates(tx, orgId) };
  });
}

async function clientInFirm(tx: Tx, orgId: string, clientId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
    .limit(1);
  return rows.length > 0;
}

function pricingView(r: typeof clientPricing.$inferSelect): PricingView {
  return { clientId: r.clientId, model: r.model, currency: r.currency, fixedCents: r.fixedCents, retainerCents: r.retainerCents };
}

export async function getPricing(orgId: string, clientId: string): Promise<{ pricing: PricingView | null } | null> {
  return withOrg(orgId, async (tx) => {
    if (!(await clientInFirm(tx, orgId, clientId))) return null;
    const rows = await tx
      .select()
      .from(clientPricing)
      .where(and(eq(clientPricing.clientId, clientId), eq(clientPricing.orgId, orgId)))
      .limit(1);
    return { pricing: rows[0] ? pricingView(rows[0]) : null };
  });
}

export async function setPricing(orgId: string, clientId: string, input: PricingSet): Promise<PricingView | null> {
  return withOrg(orgId, async (tx) => {
    if (!(await clientInFirm(tx, orgId, clientId))) return null;
    const rows = await tx
      .insert(clientPricing)
      .values({
        clientId,
        orgId,
        model: input.model,
        currency: input.currency,
        fixedCents: input.fixedCents,
        retainerCents: input.retainerCents,
      })
      .onConflictDoUpdate({
        target: clientPricing.clientId,
        set: {
          model: input.model,
          currency: input.currency,
          fixedCents: input.fixedCents,
          retainerCents: input.retainerCents,
          updatedAt: new Date(),
        },
        setWhere: eq(clientPricing.orgId, orgId),
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('pricing upsert returned no row');
    return pricingView(row);
  });
}
