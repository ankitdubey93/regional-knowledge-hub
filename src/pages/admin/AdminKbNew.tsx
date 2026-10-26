import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RequireAdmin } from '../../components/RequireAdmin';
import { Button, Callout, Card, Field, PageHeader, Tabs, TextLink, inputClass } from '../../components/ui';
import {
  KIND_LABELS,
  createDraft,
  createSource,
  getSource,
  listSources,
  uploadVersion,
  type BillStatus,
  type KbJurisdiction,
  type KbKind,
  type KbSource,
  type KbSourceListItem,
  type KbVersionDetail,
  type SourceInput,
  type VersionMeta,
} from '../../lib/admin';
import { ApiError } from '../../lib/api';

const JURISDICTIONS: KbJurisdiction[] = ['AU', 'UK', 'INTL'];
const JURISDICTION_NAMES: Record<KbJurisdiction, string> = { AU: 'Australia', UK: 'United Kingdom', INTL: 'International' };
const NEW_KINDS: KbKind[] = ['act', 'regulation', 'bill', 'ruling', 'guidance', 'standard'];
const BILL_STATUSES: BillStatus[] = ['introduced', 'passed', 'assented', 'lapsed'];
const BILL_STATUS_NAMES: Record<BillStatus, string> = { introduced: 'Introduced', passed: 'Passed', assented: 'Assented', lapsed: 'Lapsed' };

type SourceTab = 'existing' | 'new';
type InputTab = 'paste' | 'file' | 'url';

function asJurisdiction(v: string): KbJurisdiction {
  return JURISDICTIONS.find((j) => j === v) ?? 'AU';
}

function asKind(v: string): KbKind {
  return NEW_KINDS.find((k) => k === v) ?? 'act';
}

function asBillStatus(v: string): BillStatus | null {
  return BILL_STATUSES.find((b) => b === v) ?? null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankToNull(v: string): string | null {
  return v.trim() === '' ? null : v.trim();
}

// Data lives in its own component so that nothing is fetched until RequireAdmin has passed.
function NewPanel() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fixedSourceId = params.get('source');

  const [fixedSource, setFixedSource] = useState<KbSource | null>(null);
  const [existing, setExisting] = useState<KbSourceListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sourceTab, setSourceTab] = useState<SourceTab>('existing');
  const [existingId, setExistingId] = useState('');
  const [title, setTitle] = useState('');
  const [citation, setCitation] = useState('');
  const [jurisdiction, setJurisdiction] = useState<KbJurisdiction>('AU');
  const [kind, setKind] = useState<KbKind>('act');
  const [officialUrl, setOfficialUrl] = useState('');
  const [publisher, setPublisher] = useState('');
  const [billStatus, setBillStatus] = useState<BillStatus | ''>('');
  const [createdSourceId, setCreatedSourceId] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [retrievedOn, setRetrievedOn] = useState(today());
  const [changeNote, setChangeNote] = useState('');

  const [inputTab, setInputTab] = useState<InputTab>('paste');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fetchUrl, setFetchUrl] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    if (fixedSourceId !== null) {
      getSource(fixedSourceId)
        .then((body) => {
          if (!cancelled) setFixedSource(body.source);
        })
        .catch((err: unknown) => {
          if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load this source');
        });
    } else {
      listSources({})
        .then((body) => {
          if (!cancelled) setExisting(body.sources.filter((s) => s.kind !== 'curriculum'));
        })
        .catch((err: unknown) => {
          if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load the sources');
        });
    }
    return () => {
      cancelled = true;
    };
  }, [fixedSourceId]);

  function sourceInput(): SourceInput {
    return {
      jurisdiction,
      kind,
      title: title.trim(),
      citation: citation.trim(),
      officialUrl: blankToNull(officialUrl),
      publisher: publisher.trim(),
      ...(kind === 'bill' ? { billStatus: asBillStatus(billStatus) } : {}),
    };
  }

  function versionMeta(): VersionMeta {
    return {
      label: label.trim(),
      effectiveFrom: effectiveFrom === '' ? null : effectiveFrom,
      effectiveTo: effectiveTo === '' ? null : effectiveTo,
      retrievedOn,
      changeNote: changeNote.trim(),
    };
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (fixedSourceId === null && sourceTab === 'existing' && existingId === '') {
      setError('Choose a source, or add a new one.');
      return;
    }
    if (inputTab === 'file' && file === null) {
      setError('Choose a file to upload.');
      return;
    }
    setBusy(true);
    try {
      let sourceId: string;
      if (fixedSourceId !== null) {
        sourceId = fixedSourceId;
      } else if (sourceTab === 'existing') {
        sourceId = existingId;
      } else if (createdSourceId !== null) {
        // An earlier attempt created the source but failed after it: reuse it rather than make a duplicate.
        sourceId = createdSourceId;
      } else {
        const { source } = await createSource(sourceInput());
        setCreatedSourceId(source.id);
        sourceId = source.id;
      }
      let created: { detail: KbVersionDetail };
      if (inputTab === 'file' && file !== null) {
        created = await uploadVersion(sourceId, file, versionMeta());
      } else if (inputTab === 'url') {
        created = await createDraft(sourceId, { ...versionMeta(), method: 'url', url: fetchUrl.trim() });
      } else {
        created = await createDraft(sourceId, { ...versionMeta(), method: 'paste', text });
      }
      navigate(`/admin/kb/versions/${created.detail.version.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the draft');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add material"
        lead="Paste or upload the official text. You will see how it splits before anything is published."
      />

      {loadError !== null && <Callout tone="bad">{loadError}</Callout>}

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">1. Source</h2>
          {fixedSourceId !== null ? (
            <div className="space-y-2">
              {fixedSource === null ? <p className="text-muted">Loading…</p> : <p className="font-medium">{fixedSource.title}</p>}
              <TextLink to="/admin/kb/new">Choose another</TextLink>
            </div>
          ) : (
            <div className="space-y-4">
              <Tabs
                label="Source"
                tabs={[
                  { id: 'existing', label: 'Existing source' },
                  { id: 'new', label: 'New source' },
                ]}
                value={sourceTab}
                onChange={setSourceTab}
              />
              {sourceTab === 'existing' ? (
                <Field label="Source">
                  <select className={inputClass} value={existingId} onChange={(e) => setExistingId(e.target.value)}>
                    <option value="">Choose a source</option>
                    {existing.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title">
                    <input type="text" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
                  </Field>
                  <Field label="Citation" hint="For example: A New Tax System (Goods and Services Tax) Act 1999 (Cth)">
                    <input type="text" className={inputClass} value={citation} onChange={(e) => setCitation(e.target.value)} />
                  </Field>
                  <Field label="Jurisdiction">
                    <select className={inputClass} value={jurisdiction} onChange={(e) => setJurisdiction(asJurisdiction(e.target.value))}>
                      {JURISDICTIONS.map((j) => (
                        <option key={j} value={j}>
                          {JURISDICTION_NAMES[j]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Kind">
                    <select className={inputClass} value={kind} onChange={(e) => setKind(asKind(e.target.value))}>
                      {NEW_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Official URL">
                    <input type="url" className={inputClass} value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} />
                  </Field>
                  <Field label="Publisher">
                    <input type="text" className={inputClass} value={publisher} onChange={(e) => setPublisher(e.target.value)} />
                  </Field>
                  {kind === 'bill' && (
                    <Field label="Bill status">
                      <select className={inputClass} value={billStatus} onChange={(e) => setBillStatus(asBillStatus(e.target.value) ?? '')}>
                        <option value="">Not set</option>
                        {BILL_STATUSES.map((b) => (
                          <option key={b} value={b}>
                            {BILL_STATUS_NAMES[b]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">2. Version</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Version label" hint="For example: Compilation No. 85, or As introduced">
              <input type="text" className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} />
            </Field>
            <Field label="Effective from">
              <input type="date" className={inputClass} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </Field>
            <Field label="Effective to">
              <input type="date" className={inputClass} value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
            </Field>
            <Field label="Retrieved on">
              <input type="date" className={inputClass} value={retrievedOn} onChange={(e) => setRetrievedOn(e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Change note">
                <textarea rows={3} className={inputClass} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">3. Text</h2>
          <div className="space-y-4">
            <Tabs
              label="Input"
              tabs={[
                { id: 'paste', label: 'Paste' },
                { id: 'file', label: 'Upload file' },
                { id: 'url', label: 'Fetch URL' },
              ]}
              value={inputTab}
              onChange={setInputTab}
            />
            {inputTab === 'paste' && (
              <Field label="Text" hint="Markdown headings (##) help it split by section.">
                <textarea rows={16} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
            )}
            {inputTab === 'file' && (
              <Field label="File" hint=".txt, .md, .html, .pdf or .docx, up to 20 MB. Scanned PDFs have no text: paste instead.">
                <input
                  type="file"
                  accept=".txt,.md,.markdown,.html,.htm,.pdf,.docx"
                  className={inputClass}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </Field>
            )}
            {inputTab === 'url' && (
              <Field
                label="Official page URL"
                hint="legislation.gov.au, legislation.gov.uk, ato.gov.au, gov.uk, parliament.uk and other official sites only."
              >
                <input type="url" className={inputClass} value={fetchUrl} onChange={(e) => setFetchUrl(e.target.value)} />
              </Field>
            )}
          </div>
        </Card>

        {error !== null && <Callout tone="bad">{error}</Callout>}
        <div>
          <Button type="submit" disabled={busy}>
            Create draft
          </Button>
        </div>
      </form>
    </div>
  );
}

export function AdminKbNew() {
  return (
    <RequireAdmin>
      <NewPanel />
    </RequireAdmin>
  );
}
