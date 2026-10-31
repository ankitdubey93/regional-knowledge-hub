import type { AccountClass } from '@chub/shared/utils/accountClasses';
import type { ImportIssue, TbMapping } from '@chub/shared/utils/ledgerImport';
import type { BalanceSheet, ProfitAndLoss } from '@chub/shared/utils/reports';
import type { Currency } from '@chub/shared/utils/money';
import { z } from 'zod';
import { apiDelete, apiJson, failure } from './api';

export interface LedgerImportRecord {
  id: string;
  clientId: string;
  source: 'xero' | 'qbo' | 'myob' | 'other';
  currency: Currency;
  asAt: string;
  periodStart: string;
  originalName: string;
  rowCount: number;
  totalDebitCents: number;
  status: 'active' | 'superseded';
  warnings: ImportIssue[];
  createdAt: string;
}

export interface LedgerAccountRecord {
  id: string;
  code: string;
  name: string;
  sourceType: string;
  accountClass: AccountClass;
  classSetBy: 'import' | 'user';
}

export interface TbCommitBody {
  csvText: string;
  originalName: string;
  source: LedgerImportRecord['source'];
  currency: Currency;
  asAt: string;
  periodStart: string;
  mapping: TbMapping;
  classes: Record<string, AccountClass>;
}

export interface ReportResponse<T> {
  currency: Currency;
  current: { import: LedgerImportRecord; data: T };
  prior: { import: LedgerImportRecord; data: T } | null;
}

function reportQuery(importId: string, compareImportId: string | null): string {
  const params = new URLSearchParams({ importId });
  if (compareImportId !== null) params.set('compareImportId', compareImportId);
  return params.toString();
}

export async function listImports(clientId: string): Promise<LedgerImportRecord[]> {
  const body = await apiJson<{ imports: LedgerImportRecord[] }>(`/clients/${encodeURIComponent(clientId)}/ledger/imports`);
  return body.imports;
}

// The server reads the first sheet of an .xlsx and returns it as CSV text (D3). Nothing is stored. Errors use the { error } body → ApiError.
export async function convertXlsx(clientId: string, file: File): Promise<{ csvText: string; sheet: string; sheetCount: number }> {
  const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/ledger/xlsx`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
    body: file,
  });
  if (!res.ok) throw await failure(res);
  const body: unknown = await res.json();
  return z.object({ csvText: z.string(), sheet: z.string(), sheetCount: z.number().int() }).parse(body);
}

export function commitTrialBalance(clientId: string, body: TbCommitBody): Promise<{ import: LedgerImportRecord; supersededId: string | null }> {
  return apiJson<{ import: LedgerImportRecord; supersededId: string | null }>(`/clients/${encodeURIComponent(clientId)}/ledger/imports`, { method: 'POST', body });
}

export function deleteImport(clientId: string, importId: string): Promise<void> {
  return apiDelete(`/clients/${encodeURIComponent(clientId)}/ledger/imports/${encodeURIComponent(importId)}`);
}

export async function listAccounts(clientId: string): Promise<LedgerAccountRecord[]> {
  const body = await apiJson<{ accounts: LedgerAccountRecord[] }>(`/clients/${encodeURIComponent(clientId)}/ledger/accounts`);
  return body.accounts;
}

export async function setAccountClass(clientId: string, accountId: string, accountClass: AccountClass): Promise<LedgerAccountRecord> {
  const body = await apiJson<{ account: LedgerAccountRecord }>(
    `/clients/${encodeURIComponent(clientId)}/ledger/accounts/${encodeURIComponent(accountId)}`,
    { method: 'PATCH', body: { accountClass } },
  );
  return body.account;
}

export async function getProfitAndLoss(clientId: string, importId: string, compareImportId: string | null): Promise<ReportResponse<ProfitAndLoss>> {
  const body = await apiJson<{ report: ReportResponse<ProfitAndLoss> }>(
    `/clients/${encodeURIComponent(clientId)}/reports/profit-and-loss?${reportQuery(importId, compareImportId)}`,
  );
  return body.report;
}

export async function getBalanceSheet(clientId: string, importId: string, compareImportId: string | null): Promise<ReportResponse<BalanceSheet>> {
  const body = await apiJson<{ report: ReportResponse<BalanceSheet> }>(
    `/clients/${encodeURIComponent(clientId)}/reports/balance-sheet?${reportQuery(importId, compareImportId)}`,
  );
  return body.report;
}
