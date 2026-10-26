// Pure helpers for entity profiles and workspace kinds. No React, no fetch.

export type Jurisdiction = 'AU' | 'UK' | 'AU+UK';
export type EntityType = 'sole_trader' | 'partnership' | 'company' | 'trust' | 'llp';
export type TaxPeriod = 'monthly' | 'quarterly' | 'annual';
export type WorkspaceKind = 'business' | 'practice';

export interface EntityProfile {
  jurisdiction: Jurisdiction;
  entityType: EntityType;
  taxRegistered: boolean;
  taxPeriod: TaxPeriod | null;
  fyEndMonth: number;
}

export interface ClientRecord {
  id: string;
  name: string;
  notes: string;
  entities: string[];
  isSelf: boolean;
  jurisdiction: Jurisdiction;
  entityType: EntityType | null;
  taxRegistered: boolean;
  taxPeriod: TaxPeriod | null;
  fyEndMonth: number | null;
}

export type ClientBody = { name: string; notes: string } & EntityProfile;

const TYPES_AU: { value: EntityType; label: string }[] = [
  { value: 'sole_trader', label: 'Sole trader' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'company', label: 'Company' },
  { value: 'trust', label: 'Trust' },
];

const TYPES_UK: { value: EntityType; label: string }[] = [
  { value: 'sole_trader', label: 'Sole trader' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'company', label: 'Limited company' },
  { value: 'llp', label: 'LLP' },
];

const TYPES_BOTH: { value: EntityType; label: string }[] = [
  { value: 'sole_trader', label: 'Sole trader' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'company', label: 'Company' },
  { value: 'trust', label: 'Trust' },
  { value: 'llp', label: 'LLP' },
];

export function entityTypesFor(j: Jurisdiction): { value: EntityType; label: string }[] {
  if (j === 'AU') return TYPES_AU;
  if (j === 'UK') return TYPES_UK;
  return TYPES_BOTH;
}

export function entityTypeLabel(t: EntityType, j: Jurisdiction): string {
  const hit = entityTypesFor(j).find((x) => x.value === t) ?? TYPES_BOTH.find((x) => x.value === t);
  return hit?.label ?? t;
}

export function taxLabel(j: Jurisdiction): 'GST' | 'VAT' | 'GST or VAT' {
  if (j === 'AU') return 'GST';
  if (j === 'UK') return 'VAT';
  return 'GST or VAT';
}

export const TAX_PERIODS: { value: TaxPeriod; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
];

export const MONTHS: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function defaultProfile(j: Jurisdiction): EntityProfile {
  return {
    jurisdiction: j,
    entityType: 'company',
    taxRegistered: false,
    taxPeriod: null,
    fyEndMonth: j === 'UK' ? 3 : 6,
  };
}

export function withJurisdiction(p: EntityProfile, j: Jurisdiction): EntityProfile {
  const allowed = entityTypesFor(j).some((t) => t.value === p.entityType);
  return { ...p, jurisdiction: j, entityType: allowed ? p.entityType : 'company' };
}

export function profileOf(c: ClientRecord): EntityProfile {
  return {
    jurisdiction: c.jurisdiction,
    entityType: c.entityType ?? 'company',
    taxRegistered: c.taxRegistered,
    taxPeriod: c.taxPeriod,
    fyEndMonth: c.fyEndMonth ?? defaultProfile(c.jurisdiction).fyEndMonth,
  };
}

export function profileSummary(c: ClientRecord): string {
  const parts: string[] = [];
  if (c.entityType !== null) parts.push(entityTypeLabel(c.entityType, c.jurisdiction));
  if (c.taxRegistered && c.taxPeriod) {
    const period = TAX_PERIODS.find((p) => p.value === c.taxPeriod)?.label ?? '';
    parts.push(`${taxLabel(c.jurisdiction)} ${period.toLowerCase()}`);
  }
  if (c.fyEndMonth !== null) parts.push(`Year ends ${MONTHS[c.fyEndMonth - 1] ?? ''}`);
  return parts.join(' · ');
}
