import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Callout, Card, Field, PageHeader, Tabs, TableScroll, TextLink, inputClass } from '../../components/ui';
import { ApiError, apiJson } from '../../lib/api';
import type { ClientRecord } from '../../lib/entity';
import {
  getBalanceSheet,
  getProfitAndLoss,
  listImports,
  type LedgerImportRecord,
  type ReportResponse,
} from '../../lib/ledger';
import { formatMoney, formatRate, type Currency } from '../../utils/money';
import { variance, type BalanceSheet, type ProfitAndLoss, type ReportSection } from '../../utils/reports';

type Tab = 'pnl' | 'bs';

type ReportState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'pnl'; data: ReportResponse<ProfitAndLoss> }
  | { status: 'bs'; data: ReportResponse<BalanceSheet> };

interface TableRow {
  key: string;
  label: string;
  kind: 'header' | 'line' | 'total' | 'summary';
  current: number;
  prior: number;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function importLabel(imp: LedgerImportRecord): string {
  return `As at ${imp.asAt}${imp.status === 'superseded' ? ' (replaced)' : ''}`;
}

/** Rows for one section. Lines match the compare report by code; a missing side is 0. Empty sections give no rows. */
function sectionRows(cur: ReportSection, pri: ReportSection | undefined, showTotal: boolean): TableRow[] {
  const lines = new Map<string, { label: string; current: number; prior: number }>();
  for (const l of cur.lines) lines.set(l.code, { label: `${l.code} ${l.name}`, current: l.amountCents, prior: 0 });
  for (const l of pri?.lines ?? []) {
    const hit = lines.get(l.code);
    if (hit) hit.prior = l.amountCents;
    else lines.set(l.code, { label: `${l.code} ${l.name}`, current: 0, prior: l.amountCents });
  }
  if (lines.size === 0) return [];
  const sorted = [...lines.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const rows: TableRow[] = [{ key: `h-${cur.accountClass}`, label: cur.title, kind: 'header', current: 0, prior: 0 }];
  for (const [code, v] of sorted) {
    rows.push({ key: `l-${code}`, label: v.label, kind: 'line', current: v.current, prior: v.prior });
  }
  if (showTotal) {
    rows.push({
      key: `t-${cur.accountClass}`,
      label: `Total ${cur.title.toLowerCase()}`,
      kind: 'total',
      current: cur.totalCents,
      prior: pri?.totalCents ?? 0,
    });
  }
  return rows;
}

function summary(key: string, label: string, current: number, prior: number): TableRow {
  return { key, label, kind: 'summary', current, prior };
}

function pnlRows(cur: ProfitAndLoss, pri: ProfitAndLoss | null): TableRow[] {
  return [
    ...sectionRows(cur.revenue, pri?.revenue, true),
    ...sectionRows(cur.costOfSales, pri?.costOfSales, true),
    summary('gross', 'Gross profit', cur.grossProfitCents, pri?.grossProfitCents ?? 0),
    ...sectionRows(cur.otherIncome, pri?.otherIncome, true),
    ...sectionRows(cur.operatingExpenses, pri?.operatingExpenses, true),
    ...sectionRows(cur.otherExpenses, pri?.otherExpenses, true),
    summary('net', 'Net profit', cur.netProfitCents, pri?.netProfitCents ?? 0),
  ];
}

// The equity section has no total row of its own: "Total equity" below is totalEquityCents, which includes current year earnings.
function balanceSheetRows(cur: BalanceSheet, pri: BalanceSheet | null): TableRow[] {
  return [
    ...sectionRows(cur.currentAssets, pri?.currentAssets, true),
    ...sectionRows(cur.nonCurrentAssets, pri?.nonCurrentAssets, true),
    summary('ta', 'Total assets', cur.totalAssetsCents, pri?.totalAssetsCents ?? 0),
    ...sectionRows(cur.currentLiabilities, pri?.currentLiabilities, true),
    ...sectionRows(cur.nonCurrentLiabilities, pri?.nonCurrentLiabilities, true),
    summary('tl', 'Total liabilities', cur.totalLiabilitiesCents, pri?.totalLiabilitiesCents ?? 0),
    summary('na', 'Net assets', cur.netAssetsCents, pri?.netAssetsCents ?? 0),
    ...sectionRows(cur.equity, pri?.equity, false),
    summary('cye', 'Current year earnings', cur.currentYearEarningsCents, pri?.currentYearEarningsCents ?? 0),
    summary('te', 'Total equity', cur.totalEquityCents, pri?.totalEquityCents ?? 0),
  ];
}

function ReportTable({
  rows,
  currency,
  currentLabel,
  compareLabel,
}: {
  rows: TableRow[];
  currency: Currency;
  currentLabel: string;
  compareLabel: string | null;
}) {
  const compare = compareLabel !== null;
  const colCount = compare ? 5 : 2;
  return (
    <TableScroll>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th scope="col" className="border-b border-line px-2 py-1 font-medium">Account</th>
            <th scope="col" className="border-b border-line px-2 py-1 text-right font-medium">{currentLabel}</th>
            {compare && (
              <>
                <th scope="col" className="border-b border-line px-2 py-1 text-right font-medium">{compareLabel}</th>
                <th scope="col" className="border-b border-line px-2 py-1 text-right font-medium">Change</th>
                <th scope="col" className="border-b border-line px-2 py-1 text-right font-medium">Change %</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            if (r.kind === 'header') {
              return (
                <tr key={r.key}>
                  <th scope="row" colSpan={colCount} className="px-2 pb-1 pt-4 text-left font-semibold">
                    {r.label}
                  </th>
                </tr>
              );
            }
            const bold = r.kind === 'total' || r.kind === 'summary';
            const v = compare ? variance(r.current, r.prior) : null;
            return (
              <tr key={r.key} className={bold ? 'border-t border-line font-semibold' : undefined}>
                <th scope="row" className={`px-2 py-1 text-left ${bold ? 'font-semibold' : 'font-normal'}`}>
                  {r.label}
                </th>
                <td className="px-2 py-1 text-right">{formatMoney(r.current, currency)}</td>
                {compare && v !== null && (
                  <>
                    <td className="px-2 py-1 text-right">{formatMoney(r.prior, currency)}</td>
                    <td className="px-2 py-1 text-right">{formatMoney(v.changeCents, currency)}</td>
                    <td className="px-2 py-1 text-right">{v.changeBp === null ? '—' : formatRate(v.changeBp)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

export function EntityReports() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [imports, setImports] = useState<LedgerImportRecord[] | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'bs' ? 'bs' : 'pnl');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState(searchParams.get('compareId') ?? '');
  const [report, setReport] = useState<ReportState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiJson<{ client: ClientRecord }>(`/clients/${id}`)
      .then(async (body) => {
        const imps = await listImports(id);
        if (cancelled) return;
        setClient(body.client);
        setImports(imps);
      })
      .catch((err: unknown) => {
        if (!cancelled) setPageError(errorMessage(err, 'Could not load the client'));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Derived selection. Plain expressions, computed before any early return.
  const list = imports ?? [];
  const importParam = searchParams.get('importId');
  const defaultId = list.find((i) => i.id === importParam)?.id ?? list.find((i) => i.status === 'active')?.id ?? null;
  const selectedId = pickedId ?? defaultId;
  const compareKey = compareId !== '' && compareId !== selectedId ? compareId : '';

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    const compare = compareKey === '' ? null : compareKey;
    setReport({ status: 'loading' });
    const req: Promise<ReportState> =
      tab === 'pnl'
        ? getProfitAndLoss(id, selectedId, compare).then((data): ReportState => ({ status: 'pnl', data }))
        : getBalanceSheet(id, selectedId, compare).then((data): ReportState => ({ status: 'bs', data }));
    req
      .then((s) => {
        if (!cancelled) setReport(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) setReport({ status: 'error', message: errorMessage(err, 'Could not load the report') });
      });
    return () => {
      cancelled = true;
    };
  }, [id, selectedId, compareKey, tab]);

  if (pageError !== null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" />
        <p role="alert" className="text-sm text-bad">
          {pageError}
        </p>
      </div>
    );
  }
  if (client === null || imports === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" />
        <p className="text-muted">Loading…</p>
      </div>
    );
  }
  if (imports.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" lead={client.name} />
        <Card>
          <p className="text-sm">No trial balance has been imported yet.</p>
          <div className="mt-3">
            <TextLink to={`/entities/${id}/books`}>Import a trial balance</TextLink>
          </div>
        </Card>
      </div>
    );
  }

  const compareOptions = list.filter((i) => i.id !== selectedId);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" lead={client.name} />
      <Card>
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <Field label="Trial balance">
            <select className={inputClass} value={selectedId ?? ''} onChange={(e) => setPickedId(e.target.value)}>
              {list.map((imp) => (
                <option key={imp.id} value={imp.id}>
                  {importLabel(imp)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Compare with">
            <select className={inputClass} value={compareKey} onChange={(e) => setCompareId(e.target.value)}>
              <option value="">Nothing</option>
              {compareOptions.map((imp) => (
                <option key={imp.id} value={imp.id}>
                  {importLabel(imp)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Tabs
          tabs={[
            { id: 'pnl', label: 'Profit and loss' },
            { id: 'bs', label: 'Balance sheet' },
          ]}
          value={tab}
          onChange={setTab}
          label="Report"
        />

        {report.status === 'loading' && <p className="text-muted">Loading…</p>}
        {report.status === 'error' && (
          <p role="alert" className="text-sm text-bad">
            {report.message}
          </p>
        )}
        {report.status === 'pnl' && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {`Year to date from ${report.data.current.import.periodStart} to ${report.data.current.import.asAt}`}
            </p>
            <ReportTable
              rows={pnlRows(report.data.current.data, report.data.prior?.data ?? null)}
              currency={report.data.currency}
              currentLabel={`As at ${report.data.current.import.asAt}`}
              compareLabel={report.data.prior === null ? null : `As at ${report.data.prior.import.asAt}`}
            />
          </div>
        )}
        {report.status === 'bs' && (
          <div className="space-y-3">
            <p className="text-sm text-muted">{`As at ${report.data.current.import.asAt}`}</p>
            {[...report.data.current.data.issues, ...(report.data.prior?.data.issues ?? [])].length > 0 && (
              <Callout tone="bad">
                <ul className="list-disc space-y-1 pl-5">
                  {[...report.data.current.data.issues, ...(report.data.prior?.data.issues ?? [])].map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </Callout>
            )}
            <ReportTable
              rows={balanceSheetRows(report.data.current.data, report.data.prior?.data ?? null)}
              currency={report.data.currency}
              currentLabel={`As at ${report.data.current.import.asAt}`}
              compareLabel={report.data.prior === null ? null : `As at ${report.data.prior.import.asAt}`}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
