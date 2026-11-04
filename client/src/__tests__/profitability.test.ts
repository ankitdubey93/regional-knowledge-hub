import { describe, expect, it } from 'vitest';
import {
  entryValues,
  marginBp,
  profitReport,
  profitTotals,
  realisationBp,
  sortEntities,
  type ProfitInput,
  type ProfitRate,
} from '@chub/shared/utils/profitability';

const rates: ProfitRate[] = [
  { userId: null, centsPerHour: 15000, costCentsPerHour: 6000 },
  { userId: 'u2', centsPerHour: 9000, costCentsPerHour: null },
];

const input: ProfitInput = {
  invoices: [
    { id: 'i1', clientId: 'c1', engagementId: null, subtotalCents: 22500 },
    { id: 'i2', clientId: 'c1', engagementId: 'e2', subtotalCents: 110000 },
    { id: 'i3', clientId: 'c2', engagementId: null, subtotalCents: 50000 },
  ],
  lines: [
    { invoiceId: 'i1', kind: 'time', amountCents: 22500, entryEngagementId: 'e1' },
    { invoiceId: 'i2', kind: 'fixed', amountCents: 110000, entryEngagementId: null },
    { invoiceId: 'i3', kind: 'manual', amountCents: 50000, entryEngagementId: null },
  ],
  entries: [
    { invoiceId: 'i1', engagementId: 'e1', userId: 'u1', minutes: 90 },
    { invoiceId: 'i2', engagementId: 'e2', userId: 'u1', minutes: 600 },
  ],
  rates,
  clientNames: { c1: 'Harbour Co', c2: 'Bay Co' },
  engagementTitles: { e1: 'BAS Q1', e2: 'Year end' },
};

describe('profitability engine', () => {
  it('PFE1 entry values use the member rate, else the firm default', () => {
    expect(entryValues({ userId: 'u1', minutes: 90 }, rates)).toEqual({ costCents: 9000, standardCents: 22500 });
    expect(entryValues({ userId: 'u2', minutes: 20 }, rates)).toEqual({ costCents: 2000, standardCents: 3000 });
  });

  it('PFE2 no rate gives null', () => {
    expect(entryValues({ userId: 'u1', minutes: 60 }, [])).toEqual({ costCents: null, standardCents: null });
  });

  it('PFE3 entry cost rounds half away from zero', () => {
    expect(
      entryValues({ userId: 'u1', minutes: 1 }, [{ userId: null, centsPerHour: 30, costCentsPerHour: 30 }]),
    ).toEqual({ costCents: 1, standardCents: 1 });
  });

  it('PFE4 realisation', () => {
    expect(realisationBp(22500, 22500)).toBe(10000);
    expect(realisationBp(20000, 22500)).toBe(8889);
    expect(realisationBp(100, 0)).toBeNull();
    expect(realisationBp(100, null)).toBeNull();
  });

  it('PFE5 margin', () => {
    expect(marginBp(22500, 9000)).toBe(6000);
    expect(marginBp(10000, 15000)).toBe(-5000);
    expect(marginBp(0, 100)).toBeNull();
    expect(marginBp(100, null)).toBeNull();
  });

  it("PFE6 a missing cost makes the row's cost and margin null", () => {
    expect(
      profitTotals(10000, [
        { minutes: 90, costCents: 9000, standardCents: 22500 },
        { minutes: 30, costCents: null, standardCents: 7500 },
      ]),
    ).toEqual({
      billedCents: 10000,
      minutes: 120,
      costCents: null,
      standardCents: 30000,
      realisationBp: 3333,
      marginBp: null,
      missingCostMinutes: 30,
      missingRateMinutes: 0,
    });
  });

  it('PFE7 entity totals and engagement rows', () => {
    const row = profitReport(input)[0]!;
    expect(row).toMatchObject({
      clientId: 'c1',
      clientName: 'Harbour Co',
      invoiceCount: 2,
      billedCents: 132500,
      minutes: 690,
      costCents: 69000,
      standardCents: 172500,
      realisationBp: 7681,
      marginBp: 4792,
    });
    expect(row.engagements).toEqual([
      {
        engagementId: 'e2', title: 'Year end', billedCents: 110000, minutes: 600, costCents: 60000,
        standardCents: 150000, realisationBp: 7333, marginBp: 4545, missingCostMinutes: 0, missingRateMinutes: 0,
      },
      {
        engagementId: 'e1', title: 'BAS Q1', billedCents: 22500, minutes: 90, costCents: 9000,
        standardCents: 22500, realisationBp: 10000, marginBp: 6000, missingCostMinutes: 0, missingRateMinutes: 0,
      },
    ]);
  });

  it('PFE8 an entity with no time', () => {
    expect(profitReport(input)[1]).toMatchObject({
      clientId: 'c2',
      billedCents: 50000,
      minutes: 0,
      costCents: 0,
      standardCents: 0,
      realisationBp: null,
      marginBp: 10000,
      engagements: [],
    });
  });

  it('PFE9 least profitable first, n/a last', () => {
    const ids = profitReport({
      ...input,
      invoices: [...input.invoices, { id: 'i4', clientId: 'c3', engagementId: null, subtotalCents: 1000 }],
      entries: [...input.entries, { invoiceId: 'i4', engagementId: null, userId: 'u9', minutes: 30 }],
      rates: [
        { userId: null, centsPerHour: 15000, costCentsPerHour: null },
        { userId: 'u1', centsPerHour: 15000, costCentsPerHour: 6000 },
      ],
      clientNames: { ...input.clientNames, c3: 'Cove Co' },
    }).map((r) => r.clientId);
    expect(ids).toEqual(['c1', 'c2', 'c3']);
  });

  it('PFE10 sortEntities', () => {
    const rows = profitReport(input);
    expect(sortEntities(rows, 'margin-desc').map((r) => r.clientId)).toEqual(['c2', 'c1']);
    expect(sortEntities(rows, 'name').map((r) => r.clientId)).toEqual(['c2', 'c1']);
    expect(rows.map((r) => r.clientId)).toEqual(['c1', 'c2']);
  });
});
