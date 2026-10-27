import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminNav } from '../../components/AdminNav';
import { RequireAdmin } from '../../components/RequireAdmin';
import { Callout, Field, PageHeader, TableScroll, TextLink, inputClass } from '../../components/ui';
import { listAdminFacts, type AdminFactRow } from '../../lib/adminFacts';
import { ApiError } from '../../lib/api';
import { factStatus, formatFact, type FactStatus } from '../../data/factFormat';
import type { Jurisdiction } from '../../data/schemas';
import { todayIso } from '../../utils/srs';

const JURISDICTION_NAMES: Record<Jurisdiction, string> = { AU: 'Australia', UK: 'United Kingdom', INTL: 'International' };
const JURISDICTIONS: Jurisdiction[] = ['AU', 'UK', 'INTL'];
const STATUS_LABELS: Record<FactStatus, string> = { verified: 'Verified', stale: 'Over a year old', unverified: 'Unverified' };

function asJurisdiction(v: string): Jurisdiction | undefined {
  return JURISDICTIONS.find((j) => j === v);
}

// Data lives in its own component so that nothing is fetched until RequireAdmin has passed.
function FactsPanel() {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction | undefined>(undefined);
  const [q, setQ] = useState('');
  const [facts, setFacts] = useState<AdminFactRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    listAdminFacts(q.trim(), jurisdiction)
      .then((body) => {
        if (!cancelled) setFacts(body.facts);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load the facts');
      });
    return () => {
      cancelled = true;
    };
  }, [jurisdiction, q]);

  const today = todayIso();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facts"
        lead="Rates, thresholds and dates the site and the assistant use. Each one has an official source."
      >
        <div className="mt-4">
          <Link
            to="/admin/facts/new"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
          >
            Add a fact
          </Link>
        </div>
      </PageHeader>
      <AdminNav />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jurisdiction">
          <select
            className={inputClass}
            value={jurisdiction ?? ''}
            onChange={(e) => setJurisdiction(asJurisdiction(e.target.value))}
          >
            <option value="">All</option>
            {JURISDICTIONS.map((j) => (
              <option key={j} value={j}>
                {JURISDICTION_NAMES[j]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Search facts">
          <input type="text" className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
      </div>

      {loadError !== null && <Callout tone="bad">{loadError}</Callout>}
      {facts === null && loadError === null && <p className="text-muted">Loading…</p>}

      {facts !== null && facts.length === 0 && <p className="text-muted">No facts match.</p>}

      {facts !== null && facts.length > 0 && (
        <TableScroll>
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Key</th>
                <th scope="col" className="px-3 py-2 font-medium">Label</th>
                <th scope="col" className="px-3 py-2 font-medium">Value</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium">Used by</th>
                <th scope="col" className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {facts.map((row) => (
                <tr key={row.key} className="border-b border-line align-top">
                  <td className="px-3 py-2">
                    <TextLink to={`/admin/facts/${encodeURIComponent(row.key)}`}>{row.key}</TextLink>
                  </td>
                  <td className="px-3 py-2">{row.fact.label}</td>
                  <td className="px-3 py-2">{formatFact(row.fact)}</td>
                  <td className="px-3 py-2">{STATUS_LABELS[factStatus(row.fact, today)]}</td>
                  <td className="px-3 py-2">{`${row.docCount} guide(s)`}</td>
                  <td className="px-3 py-2">{row.updatedAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  );
}

export function AdminFacts() {
  return (
    <RequireAdmin>
      <FactsPanel />
    </RequireAdmin>
  );
}
