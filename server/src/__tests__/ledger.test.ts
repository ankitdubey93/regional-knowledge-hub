import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth } from '../auth';
import { pool } from '../db/client';
import { ledgerImport } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { AU_TB_CSV, UK_TB_CSV, UK_TB_UNBALANCED_CSV } from '@chub/shared/fixtures/tb';
import { call, createFirm, mergeCookies, signUp } from './helpers';
import { stopApp } from './server';

interface ImportBody {
  import: { id: string; rowCount: number; totalDebitCents: number; status: string; warnings: { code: string }[] };
  supersededId: string | null;
}
interface ErrorBody {
  error: string;
  issues?: { code: string; message: string }[];
}
interface AccountRow {
  id: string;
  code: string;
  accountClass: string;
  classSetBy: string;
}

const AU_MAPPING = { headerRow: 4, code: 1, name: 0, type: 2, debit: 3, credit: 4, balance: null };
const UK_MAPPING = { headerRow: 0, code: 0, name: 1, type: 2, debit: 3, credit: 4, balance: null };

const auBody = {
  csvText: AU_TB_CSV,
  originalName: 'tb.csv',
  source: 'xero',
  currency: 'AUD',
  asAt: '2026-06-30',
  periodStart: '2025-07-01',
  mapping: AU_MAPPING,
};
const ukBody = {
  csvText: UK_TB_CSV,
  originalName: 'uk.csv',
  source: 'xero',
  currency: 'GBP',
  asAt: '2026-06-30',
  periodStart: '2025-07-01',
  mapping: UK_MAPPING,
};

let cookieA = '';
let orgA = '';
let cookieB = '';
let orgB = '';
let memberCookie = '';
let auId = '';
let ukId = '';
let dualId = '';
let firstAuImportId = '';
let ukFirstImportId = '';

async function makeClient(name: string, jurisdiction: 'AU' | 'UK' | 'AU+UK'): Promise<string> {
  const res = await call('POST', '/api/clients', {
    cookie: cookieA,
    body: { name, jurisdiction, entityType: 'company', fyEndMonth: jurisdiction === 'UK' ? 3 : 6 },
  });
  if (res.status !== 201) throw new Error(`create client failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { client: { id: string } }).client.id;
}

const imports = (clientId: string) => `/api/clients/${clientId}/ledger/imports`;

beforeAll(async () => {
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Ledger Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;
  const b = await signUp();
  const firmB = await createFirm(b.cookie, 'Ledger Firm B');
  cookieB = firmB.cookie;
  orgB = firmB.orgId;

  auId = await makeClient('AU Co', 'AU');
  ukId = await makeClient('UK Ltd', 'UK');
  dualId = await makeClient('Dual Co', 'AU+UK');

  const m = await signUp();
  await auth.api.addMember({ body: { userId: m.userId, organizationId: orgA, role: 'member' } });
  const active = await call('POST', '/api/auth/organization/set-active', {
    cookie: m.cookie,
    body: { organizationId: orgA },
  });
  if (active.status !== 200) throw new Error(`member set-active failed: ${active.status}`);
  memberCookie = mergeCookies(m.cookie, active);
});

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('ledger', () => {
  it('POST ledger/imports without a session → 401', async () => {
    const res = await call('POST', imports(auId), { body: auBody });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Sign in required' });
  });

  it('imports the AU trial balance → 201', async () => {
    const res = await call('POST', imports(auId), { cookie: cookieA, body: auBody });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ImportBody;
    expect(body.import.rowCount).toBe(12);
    expect(body.import.totalDebitCents).toBe(4_130_000);
    expect(body.supersededId).toBeNull();
    expect(body.import.warnings).toHaveLength(1);
    expect(body.import.warnings[0]?.code).toBe('skipped-rows');
    firstAuImportId = body.import.id;
  });

  it('the AU profit and loss shows net profit 1,160,000 cents', async () => {
    const res = await call('GET', `/api/clients/${auId}/reports/profit-and-loss?importId=${firstAuImportId}`, { cookie: cookieA });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { currency: string; current: { data: { netProfitCents: number } }; prior: unknown } };
    expect(body.report.currency).toBe('AUD');
    expect(body.report.current.data.netProfitCents).toBe(1_160_000);
    expect(body.report.prior).toBeNull();
  });

  it('the AU balance sheet balances', async () => {
    const res = await call('GET', `/api/clients/${auId}/reports/balance-sheet?importId=${firstAuImportId}`, { cookie: cookieA });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { current: { data: { balances: boolean; totalAssetsCents: number } } } };
    expect(body.report.current.data.balances).toBe(true);
    expect(body.report.current.data.totalAssetsCents).toBe(2_170_000);
  });

  it('an unbalanced trial balance → 400 and nothing is stored', async () => {
    const res = await call('POST', imports(ukId), { cookie: cookieA, body: { ...ukBody, csvText: UK_TB_UNBALANCED_CSV } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toBe('The trial balance has problems');
    expect(body.issues?.[0]?.code).toBe('unbalanced');
    const list = await call('GET', imports(ukId), { cookie: cookieA });
    expect(((await list.json()) as { imports: unknown[] }).imports).toEqual([]);
  });

  it('an account with no type → 400 unmapped-class', async () => {
    const res = await call('POST', imports(ukId), { cookie: cookieA, body: { ...ukBody, csvText: UK_TB_CSV.replace('Overhead', 'Mystery') } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.issues?.map((i) => i.message)).toContain('Account "7100 Rent and Rates" needs a type.');
    expect(body.issues?.map((i) => i.code)).toContain('unmapped-class');
  });

  it('the same file with a class chosen for 7100 imports → 201', async () => {
    const res = await call('POST', imports(ukId), {
      cookie: cookieA,
      body: { ...ukBody, csvText: UK_TB_CSV.replace('Overhead', 'Mystery'), classes: { '7100': 'operating_expense' } },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ImportBody;
    expect(body.import.rowCount).toBe(8);
    ukFirstImportId = body.import.id;
  });

  it('a second import at the same as-at date supersedes the first', async () => {
    const res = await call('POST', imports(ukId), { cookie: cookieA, body: ukBody });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ImportBody;
    expect(body.supersededId).toBe(ukFirstImportId);
    const list = await call('GET', imports(ukId), { cookie: cookieA });
    const rows = ((await list.json()) as { imports: { status: string }[] }).imports;
    expect(rows.map((r) => r.status).sort()).toEqual(['active', 'superseded']);
  });

  it('a class the user set survives a re-import', async () => {
    const accounts = await call('GET', `/api/clients/${auId}/ledger/accounts`, { cookie: cookieA });
    const list = ((await accounts.json()) as { accounts: AccountRow[] }).accounts;
    const sales = list.find((a) => a.code === '200');
    expect(sales?.accountClass).toBe('revenue');
    const patch = await call('PATCH', `/api/clients/${auId}/ledger/accounts/${sales?.id}`, {
      cookie: cookieA,
      body: { accountClass: 'other_income' },
    });
    expect(patch.status).toBe(200);
    const again = await call('POST', imports(auId), { cookie: cookieA, body: auBody });
    expect(again.status).toBe(201);
    const after = await call('GET', `/api/clients/${auId}/ledger/accounts`, { cookie: cookieA });
    const row = ((await after.json()) as { accounts: AccountRow[] }).accounts.find((a) => a.code === '200');
    expect(row?.accountClass).toBe('other_income');
    expect(row?.classSetBy).toBe('user');
  });

  it('GBP for an AU entity → 400', async () => {
    const res = await call('POST', imports(auId), { cookie: cookieA, body: { ...auBody, currency: 'GBP' } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error).toBe('Currency must be AUD for an Australian entity');
  });

  it('comparing imports in different currencies → 400', async () => {
    const aud = await call('POST', imports(dualId), { cookie: cookieA, body: auBody });
    expect(aud.status).toBe(201);
    const audId = ((await aud.json()) as ImportBody).import.id;
    const gbp = await call('POST', imports(dualId), { cookie: cookieA, body: { ...ukBody, asAt: '2026-03-31' } });
    expect(gbp.status).toBe(201);
    const gbpId = ((await gbp.json()) as ImportBody).import.id;
    const res = await call('GET', `/api/clients/${dualId}/reports/profit-and-loss?importId=${audId}&compareImportId=${gbpId}`, { cookie: cookieA });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error).toBe('Both imports must be in the same currency');
  });

  it("firm B cannot list, import into, or read reports for firm A's client → 404", async () => {
    const list = await call('GET', imports(auId), { cookie: cookieB });
    expect(list.status).toBe(404);
    expect(await list.json()).toEqual({ error: 'Client not found' });
    const post = await call('POST', imports(auId), { cookie: cookieB, body: auBody });
    expect(post.status).toBe(404);
    expect(await post.json()).toEqual({ error: 'Client not found' });
    const accounts = await call('GET', `/api/clients/${auId}/ledger/accounts`, { cookie: cookieB });
    expect(accounts.status).toBe(404);
    const pl = await call('GET', `/api/clients/${auId}/reports/profit-and-loss?importId=${firstAuImportId}`, { cookie: cookieB });
    expect(pl.status).toBe(404);
    const bs = await call('GET', `/api/clients/${auId}/reports/balance-sheet?importId=${firstAuImportId}`, { cookie: cookieB });
    expect(bs.status).toBe(404);
  });

  it("firm B cannot delete firm A's import or change its account → 404", async () => {
    const del = await call('DELETE', `${imports(auId)}/${firstAuImportId}`, { cookie: cookieB });
    expect(del.status).toBe(404);
    const accounts = await call('GET', `/api/clients/${auId}/ledger/accounts`, { cookie: cookieA });
    const list = ((await accounts.json()) as { accounts: AccountRow[] }).accounts;
    const patch = await call('PATCH', `/api/clients/${auId}/ledger/accounts/${list[0]?.id}`, {
      cookie: cookieB,
      body: { accountClass: 'equity' },
    });
    expect(patch.status).toBe(404);
    expect(await patch.json()).toEqual({ error: 'Account not found' });
    const after = await call('GET', imports(auId), { cookie: cookieA });
    const ids = ((await after.json()) as { imports: { id: string }[] }).imports.map((i) => i.id);
    expect(ids).toContain(firstAuImportId);
  });

  it('a member cannot delete an import → 403', async () => {
    const res = await call('DELETE', `${imports(auId)}/${firstAuImportId}`, { cookie: memberCookie });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Only firm owners and admins can delete imports' });
  });

  it('the owner can delete an import → 204, then 404', async () => {
    const del = await call('DELETE', `${imports(auId)}/${firstAuImportId}`, { cookie: cookieA });
    expect(del.status).toBe(204);
    const again = await call('DELETE', `${imports(auId)}/${firstAuImportId}`, { cookie: cookieA });
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: 'Import not found' });
  });

  it('the app role sees no ledger rows without app.org_id', async () => {
    for (const table of ['ledger_import', 'ledger_account', 'ledger_balance']) {
      const rows = await pool.query(`select count(*)::int as n from ${table}`);
      expect(rows.rows[0].n).toBe(0);
    }
  });

  it('withOrg cannot insert a ledger_import for another firm', async () => {
    const err: unknown = await withOrg(orgB, (tx) =>
      tx.insert(ledgerImport).values({
        orgId: orgA,
        clientId: auId,
        source: 'xero',
        currency: 'AUD',
        asAt: '2026-01-31',
        periodStart: '2025-07-01',
        originalName: 'x.csv',
        sha256: 'x',
        rowCount: 1,
        totalDebitCents: 1,
        createdBy: 'test',
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).cause).toBeInstanceOf(Error);
    expect(((err as Error).cause as Error).message).toMatch(/row-level security/);
  });

  it("a ledger_import with firm B's org_id cannot point at firm A's client", async () => {
    const err: unknown = await withOrg(orgB, (tx) =>
      tx.insert(ledgerImport).values({
        orgId: orgB,
        clientId: auId,
        source: 'xero',
        currency: 'AUD',
        asAt: '2026-01-31',
        periodStart: '2025-07-01',
        originalName: 'x.csv',
        sha256: 'x',
        rowCount: 1,
        totalDebitCents: 1,
        createdBy: 'test',
      }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).cause).toBeInstanceOf(Error);
    expect(((err as Error).cause as Error).message).toMatch(/foreign key/);
  });

  it('a non-uuid import id → 404', async () => {
    const del = await call('DELETE', `${imports(auId)}/not-a-uuid`, { cookie: cookieA });
    expect(del.status).toBe(404);
    const report = await call('GET', `/api/clients/${auId}/reports/profit-and-loss?importId=not-a-uuid`, { cookie: cookieA });
    expect(report.status).toBe(400);
    expect(((await report.json()) as ErrorBody).error).toBe('Invalid input');
  });
});
