import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminNav } from '../../components/AdminNav';
import { RequireAdmin } from '../../components/RequireAdmin';
import { Callout, Field, PageHeader, TableScroll, TextLink, inputClass } from '../../components/ui';
import { KIND_LABELS, listSources, type KbJurisdiction, type KbKind, type KbSourceListItem } from '../../lib/admin';
import { ApiError } from '../../lib/api';

const JURISDICTIONS: KbJurisdiction[] = ['AU', 'UK', 'INTL'];
const KINDS: KbKind[] = ['act', 'regulation', 'bill', 'ruling', 'guidance', 'standard', 'curriculum'];
const JURISDICTION_NAMES: Record<KbJurisdiction, string> = { AU: 'Australia', UK: 'United Kingdom', INTL: 'International' };

function asJurisdiction(v: string): KbJurisdiction | undefined {
  return JURISDICTIONS.find((j) => j === v);
}

function asKind(v: string): KbKind | undefined {
  return KINDS.find((k) => k === v);
}

function kindText(s: KbSourceListItem): string {
  if (s.kind === 'bill') return s.billStatus === null ? 'Bill' : `Bill (${s.billStatus})`;
  return KIND_LABELS[s.kind];
}

// Data lives in its own component so that nothing is fetched until RequireAdmin has passed.
function KbPanel() {
  const [jurisdiction, setJurisdiction] = useState<KbJurisdiction | undefined>(undefined);
  const [kind, setKind] = useState<KbKind | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [sources, setSources] = useState<KbSourceListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    const filter: { jurisdiction?: KbJurisdiction; kind?: KbKind; q?: string } = { q: title.trim() };
    if (jurisdiction !== undefined) filter.jurisdiction = jurisdiction;
    if (kind !== undefined) filter.kind = kind;
    listSources(filter)
      .then((body) => {
        if (!cancelled) setSources(body.sources);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load the knowledge base');
      });
    return () => {
      cancelled = true;
    };
  }, [jurisdiction, kind, title]);

  return (
    <div className="space-y-6">
      <PageHeader title="Knowledge base" lead="Acts, Bills, guidance and site guides the assistant answers from.">
        <div className="mt-4">
          <Link
            to="/admin/kb/new"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
          >
            Add material
          </Link>
        </div>
      </PageHeader>
      <AdminNav />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Jurisdiction">
          <select className={inputClass} value={jurisdiction ?? ''} onChange={(e) => setJurisdiction(asJurisdiction(e.target.value))}>
            <option value="">All</option>
            {JURISDICTIONS.map((j) => (
              <option key={j} value={j}>
                {JURISDICTION_NAMES[j]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kind">
          <select className={inputClass} value={kind ?? ''} onChange={(e) => setKind(asKind(e.target.value))}>
            <option value="">All</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Search titles">
          <input type="text" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </div>

      {loadError !== null && <Callout tone="bad">{loadError}</Callout>}
      {sources === null && loadError === null && <p className="text-muted">Loading…</p>}

      {sources !== null && sources.length === 0 && (
        <p className="text-muted">Nothing here yet. Use Add material to start.</p>
      )}

      {sources !== null && sources.length > 0 && (
        <TableScroll>
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Title</th>
                <th scope="col" className="px-3 py-2 font-medium">Citation</th>
                <th scope="col" className="px-3 py-2 font-medium">Jurisdiction</th>
                <th scope="col" className="px-3 py-2 font-medium">Kind</th>
                <th scope="col" className="px-3 py-2 font-medium">Published version</th>
                <th scope="col" className="px-3 py-2 font-medium">Drafts</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-b border-line align-top">
                  <td className="px-3 py-2">
                    <TextLink to={`/admin/kb/sources/${s.id}`}>{s.title}</TextLink>
                  </td>
                  <td className="px-3 py-2">{s.citation}</td>
                  <td className="px-3 py-2">{JURISDICTION_NAMES[s.jurisdiction]}</td>
                  <td className="px-3 py-2">{kindText(s)}</td>
                  <td className="px-3 py-2">
                    {s.publishedVersion === null
                      ? 'None'
                      : s.publishedVersion.effectiveFrom === null
                        ? s.publishedVersion.label
                        : `${s.publishedVersion.label} · from ${s.publishedVersion.effectiveFrom}`}
                  </td>
                  <td className="px-3 py-2">{s.draftCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </div>
  );
}

export function AdminKb() {
  return (
    <RequireAdmin>
      <KbPanel />
    </RequireAdmin>
  );
}
