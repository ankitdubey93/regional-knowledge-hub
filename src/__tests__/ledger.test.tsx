import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { AU_TB_CSV, UK_TB_CSV } from './fixtures/tb';
import { EntityDashboard } from '../pages/entity/EntityDashboard';
import { EntityBooks } from '../pages/entity/EntityBooks';
import { EntityReports } from '../pages/entity/EntityReports';
import type { LedgerImportRecord } from '../lib/ledger';
import * as session from '../lib/session';
import { suggestClass } from '../utils/accountClasses';
import { parseCsv } from '../utils/csv';
import { mapTrialBalance, type TbMapping } from '../utils/ledgerImport';
import { balanceSheet, profitAndLoss, type Balance, type ReportAccount } from '../utils/reports';

const signedIn = {
  session: { userId: 'u1', email: 'a@firm.test', name: 'A', activeFirmId: 'org1', activeFirmName: 'Firm A', activeWorkspaceKind: 'practice' as const },
  pending: false,
};

const acme = {
  id: 'c1',
  name: 'Acme Pty Ltd',
  jurisdiction: 'AU',
  notes: '',
  entities: [],
  isSelf: false,
  entityType: 'company',
  taxRegistered: false,
  taxPeriod: null,
  fyEndMonth: 6,
};

const ukLtd = { ...acme, id: 'c2', name: 'UK Ltd', jurisdiction: 'UK' };

function importRecord(over: Partial<LedgerImportRecord> = {}): LedgerImportRecord {
  return {
    id: 'imp1',
    clientId: 'c1',
    source: 'xero',
    currency: 'AUD',
    asAt: '2026-06-30',
    periodStart: '2025-07-01',
    originalName: 'tb.csv',
    rowCount: 12,
    totalDebitCents: 4_130_000,
    status: 'active',
    warnings: [],
    createdAt: '2026-10-26T00:00:00.000Z',
    ...over,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Stub {
  status: number;
  body: unknown;
}
const ok = (body: unknown): Stub => ({ status: 200, body });

/** Routes fetch by "METHOD /path" (query string ignored). Unknown routes answer 404, so nothing reaches the network. */
function stubApi(routes: Record<string, Stub>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url.split('?')[0] ?? url}`;
    const stub = routes[key];
    if (!stub) return jsonResponse(404, { error: `No stub for ${key}` });
    return jsonResponse(stub.status, stub.body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The AU fixture's balances and accounts, as the books page would send them to the engines. */
function auBalances() {
  const mapping: TbMapping = { headerRow: 4, code: 1, name: 0, type: 2, debit: 3, credit: 4, balance: null };
  const tb = mapTrialBalance(parseCsv(AU_TB_CSV).rows, mapping);
  const accounts: ReportAccount[] = tb.rows.map((r) => {
    const accountClass = suggestClass(r.sourceType);
    if (accountClass === null) throw new Error(`No class for ${r.sourceType}`);
    return { code: r.code, name: r.name, accountClass };
  });
  const balances: Balance[] = tb.rows.map((r) => ({ code: r.code, debitCents: r.debitCents, creditCents: r.creditCents }));
  return { balances, accounts };
}

/** The AU fixture run through the same engines, so the stubbed report matches what the server would return. */
function auReport() {
  const { balances, accounts } = auBalances();
  return profitAndLoss(balances, accounts);
}

async function loadFile(user: ReturnType<typeof userEvent.setup>, csv: string) {
  await user.upload(screen.getByLabelText('Trial balance CSV'), new File([csv], 'tb.csv', { type: 'text/csv' }));
  fireEvent.change(screen.getByLabelText('As at'), { target: { value: '2026-06-30' } });
  fireEvent.change(screen.getByLabelText(/^Financial year start/), { target: { value: '2025-07-01' } });
  await user.click(screen.getByRole('button', { name: 'Read file' }));
}

beforeEach(() => {
  // Call history only: the mocked implementations from setup.ts stay in place.
  vi.clearAllMocks();
});

describe('Books and reports (D1)', () => {
  it('the dashboard links to books and reports', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    stubApi({ 'GET /api/clients/c1': ok({ client: acme }) });
    renderAt('/entities/c1', '/entities/:id', <EntityDashboard />);
    expect(await screen.findByRole('link', { name: 'Import a trial balance' })).toHaveAttribute('href', '/entities/c1/books');
    expect(screen.getByRole('link', { name: 'View reports' })).toHaveAttribute('href', '/entities/c1/reports');
  });

  it('books shows an empty imports list', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/ledger/imports': ok({ imports: [] }),
      'GET /api/clients/c1/ledger/accounts': ok({ accounts: [] }),
    });
    renderAt('/entities/c1/books', '/entities/:id/books', <EntityBooks />);
    expect(await screen.findByText('No trial balance has been imported yet.')).toBeInTheDocument();
  });

  it('the wizard asks for a file first', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/ledger/imports': ok({ imports: [] }),
      'GET /api/clients/c1/ledger/accounts': ok({ accounts: [] }),
    });
    const user = userEvent.setup();
    renderAt('/entities/c1/books', '/entities/:id/books', <EntityBooks />);
    await screen.findByRole('heading', { name: 'Import a trial balance' });
    await user.click(screen.getByRole('button', { name: 'Read file' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a CSV file.');
  });

  it('the wizard reads the AU fixture and suggests columns', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/ledger/imports': ok({ imports: [] }),
      'GET /api/clients/c1/ledger/accounts': ok({ accounts: [] }),
    });
    const user = userEvent.setup();
    renderAt('/entities/c1/books', '/entities/:id/books', <EntityBooks />);
    await screen.findByRole('heading', { name: 'Import a trial balance' });
    await loadFile(user, AU_TB_CSV);
    expect(await screen.findByText('Step 2 of 4: Columns')).toBeInTheDocument();
    expect(screen.getByLabelText('Debit')).toHaveValue('3');
  });

  it('the wizard shows totals and imports', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    const fetchMock = stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/ledger/imports': ok({ imports: [] }),
      'GET /api/clients/c1/ledger/accounts': ok({ accounts: [] }),
      'POST /api/clients/c1/ledger/imports': { status: 201, body: { import: importRecord(), supersededId: null } },
    });
    const user = userEvent.setup();
    renderAt('/entities/c1/books', '/entities/:id/books', <EntityBooks />);
    await screen.findByRole('heading', { name: 'Import a trial balance' });
    await loadFile(user, AU_TB_CSV);
    await screen.findByText('Step 2 of 4: Columns');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 4 of 4: Check and import')).toBeInTheDocument();
    expect(screen.getByText('Debits').parentElement).toHaveTextContent('$41,300.00');
    await user.click(screen.getByRole('button', { name: 'Import trial balance' }));
    expect(await screen.findByText('Imported 12 accounts as at 2026-06-30.')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/clients/c1/ledger/imports' && init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String(post?.[1]?.body));
    expect(body.classes['200']).toBe('revenue');
  });

  it('an unset type blocks the import', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    stubApi({
      'GET /api/clients/c2': ok({ client: ukLtd }),
      'GET /api/clients/c2/ledger/imports': ok({ imports: [] }),
      'GET /api/clients/c2/ledger/accounts': ok({ accounts: [] }),
    });
    const user = userEvent.setup();
    renderAt('/entities/c2/books', '/entities/:id/books', <EntityBooks />);
    await screen.findByRole('heading', { name: 'Import a trial balance' });
    await loadFile(user, UK_TB_CSV.replace('Overhead', 'Mystery'));
    await screen.findByText('Step 2 of 4: Columns');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Account "7100 Rent and Rates" needs a type.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import trial balance' })).toBeDisabled();
  });

  it('reports renders the profit and loss', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/ledger/imports': ok({ imports: [importRecord()] }),
      'GET /api/clients/c1/reports/profit-and-loss': ok({
        report: { currency: 'AUD', current: { import: importRecord(), data: auReport() }, prior: null },
      }),
    });
    renderAt('/entities/c1/reports', '/entities/:id/reports', <EntityReports />);
    expect(await screen.findByText('Net profit')).toBeInTheDocument();
    expect(screen.getByText('Net profit').closest('tr')).toHaveTextContent('$11,600.00');
  });

  it('reports shows a comparison change', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    const pnl = auReport();
    const imp2 = importRecord({ id: 'imp2', asAt: '2025-06-30', periodStart: '2024-07-01' });
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url, 'http://localhost');
      if (u.pathname === '/api/clients/c1') return jsonResponse(200, { client: acme });
      if (u.pathname === '/api/clients/c1/ledger/imports') return jsonResponse(200, { imports: [importRecord(), imp2] });
      if (u.pathname === '/api/clients/c1/reports/profit-and-loss') {
        const prior = u.searchParams.has('compareImportId') ? { import: imp2, data: pnl } : null;
        return jsonResponse(200, { report: { currency: 'AUD', current: { import: importRecord(), data: pnl }, prior } });
      }
      return jsonResponse(404, { error: 'No stub' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/entities/c1/reports', '/entities/:id/reports', <EntityReports />);
    await screen.findByText('Net profit');
    await user.selectOptions(screen.getByLabelText('Compare with'), 'imp2');
    expect(await screen.findByRole('columnheader', { name: 'Change' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Change %' })).toBeInTheDocument();
  });

  it('reports with no imports links to books', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/ledger/imports': ok({ imports: [] }),
    });
    renderAt('/entities/c1/reports', '/entities/:id/reports', <EntityReports />);
    expect(await screen.findByRole('link', { name: 'Import a trial balance' })).toHaveAttribute('href', '/entities/c1/books');
  });

  it('reports opens the balance sheet and comparison named in the query', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    const { balances, accounts } = auBalances();
    const bs = balanceSheet(balances, accounts);
    const imp2 = importRecord({ id: 'imp2', asAt: '2025-06-30', periodStart: '2024-07-01' });
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url, 'http://localhost');
      if (u.pathname === '/api/clients/c1') return jsonResponse(200, { client: acme });
      if (u.pathname === '/api/clients/c1/ledger/imports') return jsonResponse(200, { imports: [importRecord(), imp2] });
      if (u.pathname === '/api/clients/c1/reports/balance-sheet') {
        const prior = u.searchParams.has('compareImportId') ? { import: imp2, data: bs } : null;
        return jsonResponse(200, { report: { currency: 'AUD', current: { import: importRecord(), data: bs }, prior } });
      }
      return jsonResponse(404, { error: 'No stub' });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/entities/c1/reports?tab=bs&compareId=imp2', '/entities/:id/reports', <EntityReports />);
    expect(await screen.findByText('Net assets')).toBeInTheDocument();
    const bsCalls = fetchMock.mock.calls.map(([url]) => new URL(url, 'http://localhost'));
    expect(
      bsCalls.some((u) => u.pathname === '/api/clients/c1/reports/balance-sheet' && u.searchParams.get('compareImportId') === 'imp2'),
    ).toBe(true);
  });
});
