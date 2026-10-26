import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminNav } from '../../components/AdminNav';
import { RequireAdmin } from '../../components/RequireAdmin';
import { Button, Callout, Card, Field, PageHeader, TableScroll, TextLink, inputClass } from '../../components/ui';
import { NotFound } from '../NotFound';
import {
  KIND_LABELS,
  STATUS_LABELS,
  createDraft,
  getSource,
  updateSource,
  type BillStatus,
  type KbSource,
  type KbVersionSummary,
} from '../../lib/admin';
import { ApiError } from '../../lib/api';

const JURISDICTION_NAMES: Record<KbSource['jurisdiction'], string> = { AU: 'Australia', UK: 'United Kingdom', INTL: 'International' };
const BILL_STATUSES: BillStatus[] = ['introduced', 'passed', 'assented', 'lapsed'];
const BILL_STATUS_NAMES: Record<BillStatus, string> = { introduced: 'Introduced', passed: 'Passed', assented: 'Assented', lapsed: 'Lapsed' };

function asBillStatus(v: string): BillStatus | null {
  return BILL_STATUSES.find((b) => b === v) ?? null;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const linkButton =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover';

function SourceForm({ source, onSaved }: { source: KbSource; onSaved: (s: KbSource) => void }) {
  const readOnly = source.kind === 'curriculum';
  const [title, setTitle] = useState(source.title);
  const [citation, setCitation] = useState(source.citation);
  const [officialUrl, setOfficialUrl] = useState(source.officialUrl ?? '');
  const [publisher, setPublisher] = useState(source.publisher);
  const [billStatus, setBillStatus] = useState<BillStatus | ''>(source.billStatus ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const url = officialUrl.trim();
    const patch = {
      title: title.trim(),
      citation: citation.trim(),
      officialUrl: url === '' ? null : url,
      publisher: publisher.trim(),
      ...(source.kind === 'bill' ? { billStatus: asBillStatus(billStatus) } : {}),
    };
    try {
      const { source: updated } = await updateSource(source.id, patch);
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this source');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-muted">
        Jurisdiction: {JURISDICTION_NAMES[source.jurisdiction]} · Kind: {KIND_LABELS[source.kind]}
      </p>
      <Field label="Title">
        <input type="text" className={inputClass} value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Citation">
        <input type="text" className={inputClass} value={citation} disabled={readOnly} onChange={(e) => setCitation(e.target.value)} />
      </Field>
      <Field label="Official URL">
        <input type="url" className={inputClass} value={officialUrl} disabled={readOnly} onChange={(e) => setOfficialUrl(e.target.value)} />
      </Field>
      <Field label="Publisher">
        <input type="text" className={inputClass} value={publisher} disabled={readOnly} onChange={(e) => setPublisher(e.target.value)} />
      </Field>
      {source.kind === 'bill' && (
        <Field label="Bill status">
          <select className={inputClass} value={billStatus} disabled={readOnly} onChange={(e) => setBillStatus(asBillStatus(e.target.value) ?? '')}>
            <option value="">Not set</option>
            {BILL_STATUSES.map((b) => (
              <option key={b} value={b}>
                {BILL_STATUS_NAMES[b]}
              </option>
            ))}
          </select>
        </Field>
      )}

      {readOnly ? (
        <p className="text-muted">Site guides are updated by the seed script from docs/.</p>
      ) : (
        <Button type="submit">Save source</Button>
      )}
      {error !== null && <Callout tone="bad">{error}</Callout>}
      {saved && <Callout tone="good">Saved.</Callout>}
    </form>
  );
}

// Data lives in its own component so that nothing is fetched until RequireAdmin has passed.
function SourcePanel() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<{ source: KbSource; versions: KbVersionSummary[] } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setNotFound(false);
    getSource(id)
      .then((body) => {
        if (!cancelled) setLoaded(body);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setLoadError(err instanceof ApiError ? err.message : 'Could not load this source');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (notFound) return <NotFound />;

  const published = loaded?.versions.find((v) => v.status === 'published');

  async function newDraftFromPublished() {
    if (loaded === null || published === undefined) return;
    setActionError(null);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { detail } = await createDraft(loaded.source.id, {
        method: 'copy',
        label: `${published.label} (edit)`,
        effectiveFrom: null,
        effectiveTo: null,
        retrievedOn: today,
        changeNote: '',
      });
      navigate(`/admin/kb/versions/${detail.version.id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not create the draft');
    }
  }

  return (
    <div className="space-y-6">
      {loadError !== null && <Callout tone="bad">{loadError}</Callout>}
      {loaded === null && loadError === null && <p className="text-muted">Loading…</p>}

      {loaded !== null && (
        <>
          <PageHeader title={loaded.source.title} lead={loaded.source.citation} />
          <AdminNav />

          <Card>
            <h2 className="mb-4 text-lg font-semibold">Source</h2>
            <SourceForm
              key={loaded.source.id}
              source={loaded.source}
              onSaved={(updated) => setLoaded((prev) => (prev === null ? prev : { ...prev, source: updated }))}
            />
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold">Versions</h2>
            {loaded.versions.length === 0 ? (
              <p className="text-muted">No versions yet.</p>
            ) : (
              <TableScroll>
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="border-b border-line text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Label</th>
                      <th scope="col" className="px-3 py-2 font-medium">Status</th>
                      <th scope="col" className="px-3 py-2 font-medium">Effective from</th>
                      <th scope="col" className="px-3 py-2 font-medium">Chunks</th>
                      <th scope="col" className="px-3 py-2 font-medium">Published</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loaded.versions.map((v) => (
                      <tr key={v.id} className="border-b border-line align-top">
                        <td className="px-3 py-2">
                          <TextLink to={`/admin/kb/versions/${v.id}`}>{v.label}</TextLink>
                        </td>
                        <td className="px-3 py-2">{STATUS_LABELS[v.status]}</td>
                        <td className="px-3 py-2">{v.effectiveFrom ?? '—'}</td>
                        <td className="px-3 py-2">{v.chunkCount}</td>
                        <td className="px-3 py-2">{v.publishedAt === null ? '—' : shortDate(v.publishedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Link to={`/admin/kb/new?source=${loaded.source.id}`} className={linkButton}>
                Add a version
              </Link>
              {published !== undefined && (
                <Button variant="secondary" onClick={newDraftFromPublished}>
                  New draft from published
                </Button>
              )}
            </div>
            {actionError !== null && (
              <div className="mt-4">
                <Callout tone="bad">{actionError}</Callout>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export function AdminKbSource() {
  return (
    <RequireAdmin>
      <SourcePanel />
    </RequireAdmin>
  );
}
