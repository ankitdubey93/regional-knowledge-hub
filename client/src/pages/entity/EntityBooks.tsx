import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TbImportWizard } from '../../components/TbImportWizard';
import { Button, Card, PageHeader, TableScroll, TextLink } from '../../components/ui';
import { ApiError, apiJson } from '../../lib/api';
import type { ClientRecord } from '../../lib/entity';
import {
  deleteImport,
  listAccounts,
  listImports,
  setAccountClass,
  type LedgerAccountRecord,
  type LedgerImportRecord,
} from '../../lib/ledger';
import { ACCOUNT_CLASSES, ACCOUNT_CLASS_LABELS, type AccountClass } from '@chub/shared/utils/accountClasses';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; client: ClientRecord };

const SOURCE_LABELS: Record<LedgerImportRecord['source'], string> = {
  xero: 'Xero',
  qbo: 'QuickBooks Online',
  myob: 'MYOB',
  other: 'Other',
};

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function EntityBooks() {
  const { id = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [imports, setImports] = useState<LedgerImportRecord[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccountRecord[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    apiJson<{ client: ClientRecord }>(`/clients/${id}`)
      .then(async (body) => {
        const [imps, accts] = await Promise.all([listImports(id), listAccounts(id)]);
        if (cancelled) return;
        setImports(imps);
        setAccounts(accts);
        setState({ status: 'ready', client: body.client });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'missing' });
        } else {
          setState({ status: 'error', message: errorMessage(err, 'Could not load the client') });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function reloadLedger() {
    try {
      const [imps, accts] = await Promise.all([listImports(id), listAccounts(id)]);
      setImports(imps);
      setAccounts(accts);
      setActionError(null);
    } catch (err) {
      setActionError(errorMessage(err, 'Could not reload the books'));
    }
  }

  async function onDelete(imp: LedgerImportRecord) {
    if (!window.confirm('Delete this import? Its reports will no longer be available. If it replaced an earlier import with the same date, that one becomes active again.')) return;
    try {
      await deleteImport(id, imp.id);
      await reloadLedger();
    } catch (err) {
      setActionError(errorMessage(err, 'Could not delete the import'));
    }
  }

  async function onChangeType(acc: LedgerAccountRecord, picked: AccountClass) {
    try {
      const updated = await setAccountClass(id, acc.id, picked);
      setAccounts((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      setActionError(null);
    } catch (err) {
      setActionError(errorMessage(err, 'Could not change the type'));
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace">Back to workspace</TextLink>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }
  if (state.status === 'missing') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace">Back to workspace</TextLink>
        <p>Client not found.</p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace">Back to workspace</TextLink>
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      </div>
    );
  }

  const c = state.client;
  return (
    <div className="space-y-6">
      <TextLink to={`/entities/${c.id}`}>{`Back to ${c.name}`}</TextLink>
      <PageHeader title="Books" lead={`Trial balances imported for ${c.name}.`} />

      <Card>
        <TbImportWizard
          clientId={c.id}
          jurisdiction={c.jurisdiction}
          fyEndMonth={c.fyEndMonth}
          existing={accounts}
          onImported={() => void reloadLedger()}
        />
      </Card>

      {actionError !== null && (
        <p role="alert" className="text-sm text-bad">
          {actionError}
        </p>
      )}

      <Card>
        <h2 className="font-semibold">Imports</h2>
        {imports.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No trial balance has been imported yet.</p>
        ) : (
          <TableScroll>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">As at</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Year start</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">From</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">File</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Accounts</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Status</th>
                  <th scope="col" className="relative border-b border-line px-2 py-1 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr key={imp.id}>
                    <td className="border-b border-line px-2 py-1">{imp.asAt}</td>
                    <td className="border-b border-line px-2 py-1">{imp.periodStart}</td>
                    <td className="border-b border-line px-2 py-1">{SOURCE_LABELS[imp.source]}</td>
                    <td className="border-b border-line px-2 py-1">{imp.originalName}</td>
                    <td className="border-b border-line px-2 py-1">{imp.rowCount}</td>
                    <td className="border-b border-line px-2 py-1">{imp.status === 'active' ? 'Active' : 'Replaced'}</td>
                    <td className="border-b border-line px-2 py-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <TextLink to={`/entities/${c.id}/reports?importId=${imp.id}`}>View reports</TextLink>
                        <Button variant="secondary" aria-label={`Delete import as at ${imp.asAt}`} onClick={() => void onDelete(imp)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Accounts</h2>
        <p className="mt-1 text-sm text-muted">A type you choose here is kept when you import again.</p>
        {accounts.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No accounts yet.</p>
        ) : (
          <TableScroll>
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Code</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Account</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id}>
                    <td className="border-b border-line px-2 py-1">{acc.code}</td>
                    <td className="border-b border-line px-2 py-1">{acc.name}</td>
                    <td className="border-b border-line px-2 py-1">
                      <select
                        aria-label={`Type for ${acc.code} ${acc.name}`}
                        className="min-h-10 rounded-lg border border-line bg-panel px-3 py-2 text-base text-ink sm:text-sm"
                        value={acc.accountClass}
                        onChange={(e) => {
                          const picked = ACCOUNT_CLASSES.find((k) => k === e.target.value);
                          if (picked) void onChangeType(acc, picked);
                        }}
                      >
                        {ACCOUNT_CLASSES.map((k) => (
                          <option key={k} value={k}>
                            {ACCOUNT_CLASS_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </div>
  );
}
