import { createHash } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { client, ledgerAccount, ledgerBalance, ledgerImport } from '../db/schema';
import { withOrg, type Tx } from '../db/withOrg';
import { CURRENCY_MESSAGES, type LedgerAccount, type LedgerImport, type TbCommitInput } from '../types/ledger';
import { parseCsv } from '../../../src/utils/csv';
import { suggestClass, type AccountClass } from '../../../src/utils/accountClasses';
import { mapTrialBalance, type ImportIssue } from '../../../src/utils/ledgerImport';
import {
  balanceSheet,
  profitAndLoss,
  type Balance,
  type BalanceSheet,
  type ProfitAndLoss,
  type ReportAccount,
} from '../../../src/utils/reports';

// Every function runs in one withOrg (RLS) and keeps explicit org_id (and client_id) predicates (Hard rule 11).
// Nothing here logs csvText or row contents (Hard rule 13).

export type CommitOutcome =
  | { import: LedgerImport; supersededId: string | null }
  | { notFound: true }
  | { currencyError: string }
  | { issues: ImportIssue[] };

export type ReportOutcome<T> =
  | { currency: 'AUD' | 'GBP'; current: { import: LedgerImport; data: T }; prior: { import: LedgerImport; data: T } | null }
  | { notFound: true }
  | { currencyMismatch: true };

async function clientExists(tx: Tx, orgId: string, clientId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
    .limit(1);
  return rows.length > 0;
}

export async function listImports(orgId: string, clientId: string): Promise<LedgerImport[] | null> {
  return withOrg(orgId, async (tx) => {
    if (!(await clientExists(tx, orgId, clientId))) return null;
    return tx
      .select()
      .from(ledgerImport)
      .where(and(eq(ledgerImport.orgId, orgId), eq(ledgerImport.clientId, clientId)))
      .orderBy(desc(ledgerImport.asAt), desc(ledgerImport.createdAt));
  });
}

export async function commitTrialBalance(
  orgId: string,
  userId: string,
  clientId: string,
  input: TbCommitInput,
): Promise<CommitOutcome> {
  return withOrg(orgId, async (tx): Promise<CommitOutcome> => {
    const found = await tx
      .select()
      .from(client)
      .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
      .limit(1);
    const entity = found[0];
    if (!entity) return { notFound: true };

    if (entity.jurisdiction === 'AU' && input.currency !== 'AUD') return { currencyError: CURRENCY_MESSAGES.AU };
    if (entity.jurisdiction === 'UK' && input.currency !== 'GBP') return { currencyError: CURRENCY_MESSAGES.UK };

    const csv = parseCsv(input.csvText);
    const csvIssues: ImportIssue[] = csv.issues.map((message) => ({
      level: 'block',
      code: 'no-rows',
      message,
      row: null,
    }));
    const mapped = mapTrialBalance(csv.rows, input.mapping);
    const issues: ImportIssue[] = [...csvIssues, ...mapped.issues];

    const existing = await tx
      .select()
      .from(ledgerAccount)
      .where(and(eq(ledgerAccount.orgId, orgId), eq(ledgerAccount.clientId, clientId)));
    const existingByCode = new Map(existing.map((a) => [a.code, a]));

    const resolved: { code: string; name: string; sourceType: string; accountClass: AccountClass; userChosen: boolean }[] = [];
    for (const row of mapped.rows) {
      const chosen = input.classes[row.code];
      const prior = existingByCode.get(row.code);
      const suggested = suggestClass(row.sourceType);
      let accountClass: AccountClass | null = null;
      let userChosen = false;
      if (chosen !== undefined) {
        accountClass = chosen;
        userChosen = chosen !== suggested;
      } else if (prior && prior.classSetBy === 'user') {
        accountClass = prior.accountClass;
      } else if (suggested) {
        accountClass = suggested;
      } else if (prior) {
        accountClass = prior.accountClass;
      }
      if (accountClass === null) {
        issues.push({
          level: 'block',
          code: 'unmapped-class',
          message: `Account "${row.code} ${row.name}" needs a type.`,
          row: row.sourceRow,
        });
        continue;
      }
      resolved.push({ code: row.code, name: row.name, sourceType: row.sourceType, accountClass, userChosen });
    }

    const blocks = issues.filter((i) => i.level === 'block');
    if (blocks.length > 0) return { issues: blocks };

    const superseded = await tx
      .update(ledgerImport)
      .set({ status: 'superseded' })
      .where(
        and(
          eq(ledgerImport.orgId, orgId),
          eq(ledgerImport.clientId, clientId),
          eq(ledgerImport.asAt, input.asAt),
          eq(ledgerImport.status, 'active'),
        ),
      )
      .returning({ id: ledgerImport.id });
    const supersededId = superseded[0]?.id ?? null;

    const accountIds = new Map<string, string>();
    for (const r of resolved) {
      const upserted = await tx
        .insert(ledgerAccount)
        .values({
          orgId,
          clientId,
          code: r.code,
          name: r.name,
          sourceType: r.sourceType,
          accountClass: r.accountClass,
          classSetBy: r.userChosen ? 'user' : 'import',
        })
        .onConflictDoUpdate({
          target: [ledgerAccount.clientId, ledgerAccount.code],
          set: r.userChosen
            ? { name: r.name, sourceType: r.sourceType, accountClass: r.accountClass, classSetBy: 'user', updatedAt: new Date() }
            : {
                name: r.name,
                sourceType: r.sourceType,
                accountClass: sql`case when ${ledgerAccount.classSetBy} = 'user' then ${ledgerAccount.accountClass} else excluded.account_class end`,
                updatedAt: new Date(),
              },
        })
        .returning({ id: ledgerAccount.id });
      const id = upserted[0]?.id;
      if (!id) throw new Error('ledger account upsert returned no row');
      accountIds.set(r.code, id);
    }

    const inserted = await tx
      .insert(ledgerImport)
      .values({
        orgId,
        clientId,
        source: input.source,
        currency: input.currency,
        asAt: input.asAt,
        periodStart: input.periodStart,
        originalName: input.originalName,
        sha256: createHash('sha256').update(input.csvText).digest('hex'),
        rowCount: mapped.rows.length,
        totalDebitCents: mapped.totalDebitCents,
        warnings: issues.filter((i) => i.level === 'warn'),
        createdBy: userId,
      })
      .returning();
    const importRow = inserted[0];
    if (!importRow) throw new Error('ledger import insert returned no row');

    if (mapped.rows.length > 0) {
      await tx.insert(ledgerBalance).values(
        mapped.rows.map((row) => {
          const accountId = accountIds.get(row.code);
          if (!accountId) throw new Error('missing account id for imported row');
          return { orgId, importId: importRow.id, accountId, debitCents: row.debitCents, creditCents: row.creditCents };
        }),
      );
    }

    return { import: importRow, supersededId };
  });
}

export async function deleteImport(orgId: string, clientId: string, importId: string): Promise<'deleted' | 'not_found'> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .delete(ledgerImport)
      .where(and(eq(ledgerImport.id, importId), eq(ledgerImport.clientId, clientId), eq(ledgerImport.orgId, orgId)))
      .returning({ id: ledgerImport.id });
    return rows.length > 0 ? 'deleted' : 'not_found';
  });
}

export async function listAccounts(orgId: string, clientId: string): Promise<LedgerAccount[] | null> {
  return withOrg(orgId, async (tx) => {
    if (!(await clientExists(tx, orgId, clientId))) return null;
    return tx
      .select()
      .from(ledgerAccount)
      .where(and(eq(ledgerAccount.orgId, orgId), eq(ledgerAccount.clientId, clientId)))
      .orderBy(asc(ledgerAccount.code));
  });
}

export async function updateAccountClass(
  orgId: string,
  clientId: string,
  accountId: string,
  accountClass: AccountClass,
): Promise<LedgerAccount | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .update(ledgerAccount)
      .set({ accountClass, classSetBy: 'user', updatedAt: new Date() })
      .where(
        and(eq(ledgerAccount.id, accountId), eq(ledgerAccount.clientId, clientId), eq(ledgerAccount.orgId, orgId)),
      )
      .returning();
    return rows[0] ?? null;
  });
}

interface LoadedImport {
  import: LedgerImport;
  balances: Balance[];
  accounts: ReportAccount[];
}

async function loadImport(tx: Tx, orgId: string, clientId: string, importId: string): Promise<LoadedImport | null> {
  const found = await tx
    .select()
    .from(ledgerImport)
    .where(and(eq(ledgerImport.id, importId), eq(ledgerImport.clientId, clientId), eq(ledgerImport.orgId, orgId)))
    .limit(1);
  const importRow = found[0];
  if (!importRow) return null;
  const rows = await tx
    .select({
      code: ledgerAccount.code,
      name: ledgerAccount.name,
      accountClass: ledgerAccount.accountClass,
      debitCents: ledgerBalance.debitCents,
      creditCents: ledgerBalance.creditCents,
    })
    .from(ledgerBalance)
    .innerJoin(ledgerAccount, eq(ledgerBalance.accountId, ledgerAccount.id))
    .where(and(eq(ledgerBalance.importId, importId), eq(ledgerBalance.orgId, orgId), eq(ledgerAccount.orgId, orgId)));
  return {
    import: importRow,
    balances: rows.map((r) => ({ code: r.code, debitCents: r.debitCents, creditCents: r.creditCents })),
    accounts: rows.map((r) => ({ code: r.code, name: r.name, accountClass: r.accountClass })),
  };
}

async function buildReport<T>(
  tx: Tx,
  orgId: string,
  clientId: string,
  importId: string,
  compareImportId: string | null,
  build: (balances: Balance[], accounts: ReportAccount[]) => T,
): Promise<ReportOutcome<T>> {
  const current = await loadImport(tx, orgId, clientId, importId);
  if (!current) return { notFound: true };
  let prior: LoadedImport | null = null;
  if (compareImportId !== null) {
    prior = await loadImport(tx, orgId, clientId, compareImportId);
    if (!prior) return { notFound: true };
    if (prior.import.currency !== current.import.currency) return { currencyMismatch: true };
  }
  return {
    currency: current.import.currency,
    current: { import: current.import, data: build(current.balances, current.accounts) },
    prior: prior ? { import: prior.import, data: build(prior.balances, prior.accounts) } : null,
  };
}

export async function getProfitAndLoss(
  orgId: string,
  clientId: string,
  importId: string,
  compareImportId: string | null,
): Promise<ReportOutcome<ProfitAndLoss>> {
  return withOrg(orgId, (tx) => buildReport(tx, orgId, clientId, importId, compareImportId, profitAndLoss));
}

export async function getBalanceSheet(
  orgId: string,
  clientId: string,
  importId: string,
  compareImportId: string | null,
): Promise<ReportOutcome<BalanceSheet>> {
  return withOrg(orgId, (tx) => buildReport(tx, orgId, clientId, importId, compareImportId, balanceSheet));
}
