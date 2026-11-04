// B3 profitability. Integer cents and basis points only; every rounding goes through roundDiv (Hard rule 3).
import { timeLineCents, type LineKind } from './invoice';
import { roundDiv } from './money';

export const MAX_PROFIT_INVOICES = 5000;

export interface ProfitRate { userId: string | null; centsPerHour: number; costCentsPerHour: number | null }
export interface ProfitInvoice { id: string; clientId: string; engagementId: string | null; subtotalCents: number }
export interface ProfitLine { invoiceId: string; kind: LineKind; amountCents: number; entryEngagementId: string | null }
export interface ProfitEntry { invoiceId: string; engagementId: string | null; userId: string; minutes: number }
export interface ProfitInput {
  invoices: ProfitInvoice[];
  lines: ProfitLine[];
  entries: ProfitEntry[];
  rates: ProfitRate[]; // rate_card rows of the report currency only
  clientNames: Record<string, string>; // client id → name
  engagementTitles: Record<string, string>; // engagement id → title
}

export interface ProfitTotals {
  billedCents: number;
  minutes: number;
  costCents: number | null;
  standardCents: number | null;
  realisationBp: number | null;
  marginBp: number | null;
  missingCostMinutes: number;
  missingRateMinutes: number;
}
export interface EngagementProfit extends ProfitTotals { engagementId: string; title: string }
export interface EntityProfit extends ProfitTotals {
  clientId: string;
  clientName: string;
  invoiceCount: number;
  engagements: EngagementProfit[];
}
export type ProfitSort = 'margin-asc' | 'margin-desc' | 'name';

/** roundDiv(billed * 10000, standard); null when standard is null or 0. */
export function realisationBp(billedCents: number, standardCents: number | null): number | null {
  if (standardCents === null || standardCents === 0) return null;
  return roundDiv(billedCents * 10000, standardCents);
}

/** roundDiv((billed - cost) * 10000, billed); null when cost is null or billed is 0. Can be negative. */
export function marginBp(billedCents: number, costCents: number | null): number | null {
  if (costCents === null || billedCents === 0) return null;
  return roundDiv((billedCents - costCents) * 10000, billedCents);
}

/** One entry's cost and standard value at today's rates; each null when no rate applies. */
export function entryValues(
  entry: { userId: string; minutes: number },
  rates: ProfitRate[],
): { costCents: number | null; standardCents: number | null } {
  const member = rates.find((r) => r.userId === entry.userId);
  const firm = rates.find((r) => r.userId === null);
  const charge = member?.centsPerHour ?? firm?.centsPerHour ?? null;
  const cost = member?.costCentsPerHour ?? firm?.costCentsPerHour ?? null;
  return {
    costCents: cost === null ? null : timeLineCents(entry.minutes, cost),
    standardCents: charge === null ? null : timeLineCents(entry.minutes, charge),
  };
}

/** Sums one row. */
export function profitTotals(
  billedCents: number,
  entries: { minutes: number; costCents: number | null; standardCents: number | null }[],
): ProfitTotals {
  let minutes = 0;
  let cost = 0;
  let standard = 0;
  let missingCostMinutes = 0;
  let missingRateMinutes = 0;
  for (const e of entries) {
    minutes += e.minutes;
    if (e.costCents === null) missingCostMinutes += e.minutes;
    else cost += e.costCents;
    if (e.standardCents === null) missingRateMinutes += e.minutes;
    else standard += e.standardCents;
  }
  const costCents = missingCostMinutes > 0 ? null : cost;
  const standardCents = missingRateMinutes > 0 ? null : standard;
  return {
    billedCents,
    minutes,
    costCents,
    standardCents,
    realisationBp: realisationBp(billedCents, standardCents),
    marginBp: marginBp(billedCents, costCents),
    missingCostMinutes,
    missingRateMinutes,
  };
}

function clientInvoiceIds(input: ProfitInput, clientId: string): Set<string> {
  return new Set(input.invoices.filter((i) => i.clientId === clientId).map((i) => i.id));
}

export function engagementProfit(input: ProfitInput, clientId: string, engagementId: string): EngagementProfit {
  const invoices = input.invoices.filter((i) => i.clientId === clientId);
  const ids = new Set(invoices.map((i) => i.id));
  const invoiceEngagement = new Map(invoices.map((i) => [i.id, i.engagementId]));
  let billed = 0;
  for (const l of input.lines) {
    if (!ids.has(l.invoiceId)) continue;
    const owner = l.kind === 'time' ? l.entryEngagementId : (invoiceEngagement.get(l.invoiceId) ?? null);
    if (owner === engagementId) billed += l.amountCents;
  }
  const entries = input.entries
    .filter((e) => ids.has(e.invoiceId) && e.engagementId === engagementId)
    .map((e) => ({ minutes: e.minutes, ...entryValues(e, input.rates) }));
  return {
    engagementId,
    title: input.engagementTitles[engagementId] ?? 'Unknown engagement',
    ...profitTotals(billed, entries),
  };
}

function ordered<T extends ProfitTotals>(rows: T[], name: (r: T) => string, id: (r: T) => string, mode: ProfitSort): T[] {
  const byName = (a: T, b: T): number => {
    const an = name(a);
    const bn = name(b);
    if (an < bn) return -1;
    if (an > bn) return 1;
    const ai = id(a);
    const bi = id(b);
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  };
  return [...rows].sort((a, b) => {
    if (mode === 'name') return byName(a, b);
    const am = a.marginBp;
    const bm = b.marginBp;
    if (am === null && bm === null) return byName(a, b);
    if (am === null) return 1;
    if (bm === null) return -1;
    if (am !== bm) return mode === 'margin-asc' ? am - bm : bm - am;
    return byName(a, b);
  });
}

export function entityProfit(input: ProfitInput, clientId: string): EntityProfit {
  const invoices = input.invoices.filter((i) => i.clientId === clientId);
  const ids = clientInvoiceIds(input, clientId);
  const billed = invoices.reduce((s, i) => s + i.subtotalCents, 0);
  const entries = input.entries
    .filter((e) => ids.has(e.invoiceId))
    .map((e) => ({ minutes: e.minutes, ...entryValues(e, input.rates) }));
  const engagementIds = new Set<string>();
  for (const i of invoices) if (i.engagementId !== null) engagementIds.add(i.engagementId);
  for (const l of input.lines) if (ids.has(l.invoiceId) && l.entryEngagementId !== null) engagementIds.add(l.entryEngagementId);
  for (const e of input.entries) if (ids.has(e.invoiceId) && e.engagementId !== null) engagementIds.add(e.engagementId);
  const engagements = ordered(
    [...engagementIds].map((eid) => engagementProfit(input, clientId, eid)),
    (r) => r.title,
    (r) => r.engagementId,
    'margin-asc',
  );
  return {
    clientId,
    clientName: input.clientNames[clientId] ?? 'Unknown entity',
    invoiceCount: invoices.length,
    ...profitTotals(billed, entries),
    engagements,
  };
}

/** One row per client that has an invoice in input.invoices, sorted 'margin-asc'. */
export function profitReport(input: ProfitInput): EntityProfit[] {
  const clientIds = [...new Set(input.invoices.map((i) => i.clientId))];
  return sortEntities(clientIds.map((c) => entityProfit(input, c)), 'margin-asc');
}

/** A new array; never mutates. Engagements inside each entity keep their order. */
export function sortEntities(rows: EntityProfit[], mode: ProfitSort): EntityProfit[] {
  return ordered(rows, (r) => r.clientName, (r) => r.clientId, mode);
}
