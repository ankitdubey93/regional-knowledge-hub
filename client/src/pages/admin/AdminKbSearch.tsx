import { useState, type FormEvent } from 'react';
import { AdminNav } from '../../components/AdminNav';
import { RequireAdmin } from '../../components/RequireAdmin';
import { Button, Callout, Card, Field, PageHeader, inputClass } from '../../components/ui';
import { searchKb, type KbSearchResponse } from '../../lib/admin';
import { ApiError } from '../../lib/api';

type SearchJurisdiction = '' | 'AU' | 'UK';

function asSearchJurisdiction(v: string): SearchJurisdiction {
  return v === 'AU' || v === 'UK' ? v : '';
}

// Data lives in its own component so that nothing is searched until RequireAdmin has passed.
function SearchPanel() {
  const [question, setQuestion] = useState('');
  const [jurisdiction, setJurisdiction] = useState<SearchJurisdiction>('');
  const [includeBills, setIncludeBills] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<KbSearchResponse | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const query = question.trim();
    if (query.length < 3) {
      setError('Type at least 3 characters.');
      return;
    }
    const body: { query: string; jurisdiction?: 'AU' | 'UK'; includeBills: boolean } = { query, includeBills };
    if (jurisdiction !== '') body.jurisdiction = jurisdiction;
    setBusy(true);
    try {
      setResponse(await searchKb(body));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not run the search');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Test search" lead="Ask what a bookkeeper would ask and check that the right sections come back." />
      <AdminNav />

      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Question">
            <input type="text" className={inputClass} value={question} onChange={(e) => setQuestion(e.target.value)} />
          </Field>
          <Field label="Jurisdiction">
            <select className={inputClass} value={jurisdiction} onChange={(e) => setJurisdiction(asSearchJurisdiction(e.target.value))}>
              <option value="">All</option>
              <option value="AU">Australia</option>
              <option value="UK">United Kingdom</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeBills} onChange={(e) => setIncludeBills(e.target.checked)} />
            <span>Include Bills</span>
          </label>
          <div>
            <Button type="submit" disabled={busy}>
              Search
            </Button>
          </div>
        </form>
      </Card>

      {error !== null && <Callout tone="bad">{error}</Callout>}

      {response !== null && (
        <div className="space-y-4">
          {response.mode === 'fts' && <Callout>Keyword search only: embeddings are not configured.</Callout>}

          {response.results.length === 0 ? (
            <p className="text-muted">No published text matches. Try other words, or publish the material first.</p>
          ) : (
            <ol className="space-y-4">
              {response.results.map((r) => (
                <li key={r.chunkId} className="min-w-0 space-y-2 border-b border-line pb-4">
                  <p className="font-medium">{`${r.rank}. ${r.citation}`}</p>
                  {r.headingPath.length > 0 && <p className="text-sm">{r.headingPath.join(' › ')}</p>}
                  {r.provisionRef !== null && <p className="text-sm">{r.provisionRef}</p>}
                  <p className="text-sm text-muted">
                    {`Version ${r.versionLabel}${r.effectiveFrom !== null ? ` · in force from ${r.effectiveFrom}` : ''}`}
                  </p>
                  {r.kind === 'bill' && (
                    <span className="inline-flex rounded-full bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">Bill: not law</span>
                  )}
                  <p className="text-xs text-muted">{`Keyword #${r.ftsRank ?? '–'} · Meaning #${r.vectorRank ?? '–'}`}</p>
                  <p className="break-words text-sm">{r.text.length > 400 ? `${r.text.slice(0, 400)}…` : r.text}</p>
                  {r.officialUrl !== null && (
                    <a
                      href={r.officialUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
                    >
                      Official source
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminKbSearch() {
  return (
    <RequireAdmin>
      <SearchPanel />
    </RequireAdmin>
  );
}
