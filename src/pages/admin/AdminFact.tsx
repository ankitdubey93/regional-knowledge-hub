import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminNav } from '../../components/AdminNav';
import { RequireAdmin } from '../../components/RequireAdmin';
import { Button, Callout, Card, Field, PageHeader, TableScroll, TextLink, inputClass } from '../../components/ui';
import {
  createAdminFact,
  getAdminFact,
  updateAdminFact,
  type AdminFactDetail,
  type FactSaveResult,
  type FactWrite,
} from '../../lib/adminFacts';
import { ApiError } from '../../lib/api';
import { formatFact } from '../../data/factFormat';
import type { Fact, Jurisdiction } from '../../data/schemas';
import { formatPlain, formatRateInput, parseMoney, parseRateBp } from '../../utils/money';

type FactUnit = Fact['unit'];

const JURISDICTIONS: Jurisdiction[] = ['AU', 'UK', 'INTL'];
const JURISDICTION_NAMES: Record<Jurisdiction, string> = { AU: 'Australia', UK: 'United Kingdom', INTL: 'International' };
const UNIT_OPTIONS: { value: FactUnit; label: string }[] = [
  { value: 'bp', label: 'Rate (%)' },
  { value: 'cents', label: 'Amount' },
  { value: 'count', label: 'Count' },
  { value: 'date', label: 'Date' },
  { value: 'text', label: 'Text' },
];

function asJurisdiction(v: string): Jurisdiction {
  return JURISDICTIONS.find((j) => j === v) ?? 'AU';
}

function asUnit(v: string): FactUnit {
  return UNIT_OPTIONS.map((u) => u.value).find((u) => u === v) ?? 'bp';
}

/** The text a stored value is edited as. Rates and amounts use the same parsers the form reads them back with. */
function valueText(f: Fact): string {
  if (typeof f.value === 'string') return f.value;
  if (f.unit === 'bp') return formatRateInput(f.value);
  if (f.unit === 'cents') return formatPlain(f.value);
  return String(f.value);
}

/** Parses the typed value for a unit. Null means the input is not valid for that unit. */
function parseValue(unit: FactUnit, input: string): Fact['value'] | null {
  const t = input.trim();
  if (unit === 'bp') return parseRateBp(t);
  if (unit === 'cents') return parseMoney(t);
  if (unit === 'count') return /^\d+$/.test(t) ? Number(t) : null;
  if (unit === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  return t === '' ? null : t;
}

type SaveError = { issues: string[] } | { text: string };

interface FormProps {
  /** null on the new page. */
  existing: AdminFactDetail | null;
  onSaved: (result: FactSaveResult) => void;
}

function FactForm({ existing, onSaved }: FormProps) {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState(existing?.fact.label ?? '');
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>(existing?.fact.jurisdiction ?? 'AU');
  const [unitChoice, setUnitChoice] = useState<FactUnit>('bp');
  const [value, setValue] = useState(existing === null ? '' : valueText(existing.fact));
  const [effectiveFrom, setEffectiveFrom] = useState(existing?.fact.effectiveFrom ?? '');
  const [source, setSource] = useState(existing?.fact.source ?? '');
  const [note, setNote] = useState(existing?.fact.note ?? '');
  const [changeNote, setChangeNote] = useState('');
  const [confirmVerified, setConfirmVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [saved, setSaved] = useState<FactSaveResult | null>(null);

  // A stored fact keeps its unit; only a new fact chooses one.
  const unit: FactUnit = existing?.fact.unit ?? unitChoice;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaved(null);
    const parsed = parseValue(unit, value);
    if (parsed === null) {
      setSaveError({ text: 'Enter a valid value for this unit' });
      return;
    }
    if (changeNote.trim().length < 3) {
      setSaveError({ text: 'Say what changed (at least 3 characters)' });
      return;
    }
    const trimmedNote = note.trim();
    const fact: Fact = {
      label: label.trim(),
      jurisdiction,
      unit,
      value: parsed,
      effectiveFrom,
      source: source.trim(),
      // The client never sets the check date; the server decides it.
      verifiedOn: null,
      ...(trimmedNote === '' ? {} : { note: trimmedNote }),
    };
    const body: FactWrite = { fact, changeNote: changeNote.trim(), confirmVerified };
    setBusy(true);
    try {
      const result = existing === null ? await createAdminFact(key.trim(), body) : await updateAdminFact(existing.key, body);
      setSaved(result);
      onSaved(result);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 422) {
        setSaveError(err.issues.length > 0 ? { issues: err.issues.map((i) => i.message) } : { text: err.message });
      } else if (err instanceof ApiError) {
        setSaveError({ text: err.message });
      } else {
        setSaveError({ text: 'Could not save the fact' });
      }
    } finally {
      setBusy(false);
    }
  }

  const savedText =
    saved === null
      ? null
      : `Saved. ${saved.rechunked} guide version(s) re-chunked.` +
        (saved.rechunked > 0 && saved.embedded === null
          ? ' Their search embeddings are missing until Embed missing runs on the admin overview.'
          : '');

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {existing === null && (
            <div>
              <Field label="Key">
                <input
                  type="text"
                  className={inputClass}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <span className="mt-1 block text-xs text-muted">au., uk. or intl. then letters, digits and dots</span>
            </div>
          )}
          <Field label="Label">
            <input type="text" className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Jurisdiction">
            <select
              className={inputClass}
              value={jurisdiction}
              onChange={(e) => setJurisdiction(asJurisdiction(e.target.value))}
            >
              {JURISDICTIONS.map((j) => (
                <option key={j} value={j}>
                  {JURISDICTION_NAMES[j]}
                </option>
              ))}
            </select>
          </Field>
          {existing === null && (
            <Field label="Unit">
              <select className={inputClass} value={unitChoice} onChange={(e) => setUnitChoice(asUnit(e.target.value))}>
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Value">
            <input type="text" className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Effective from">
            <input type="date" className={inputClass} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Official source URL">
              <input type="url" className={inputClass} value={source} onChange={(e) => setSource(e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Note">
              <input type="text" className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <span className="mt-1 block text-xs text-muted">Optional.</span>
          </div>
          <div className="sm:col-span-2">
            <Field label="What changed and why">
              <textarea className={inputClass} rows={3} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
            </Field>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={confirmVerified}
            onChange={(e) => setConfirmVerified(e.target.checked)}
          />
          <span>I checked this value against the official source today</span>
        </label>

        {saveError !== null && (
          <Callout tone="bad">
            {'issues' in saveError ? (
              <ul className="list-disc space-y-1 pl-5">
                {saveError.issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              saveError.text
            )}
          </Callout>
        )}
        {savedText !== null && <Callout tone="good">{savedText}</Callout>}

        <Button type="submit" disabled={busy}>
          {existing === null ? 'Create fact' : 'Save changes'}
        </Button>
      </form>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

// Data lives in its own component so that nothing is fetched until RequireAdmin has passed.
function NewPanel() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <PageHeader title="Add a fact" />
      <AdminNav />
      <FactForm
        existing={null}
        onSaved={(result) => navigate(`/admin/facts/${encodeURIComponent(result.detail.key)}`)}
      />
    </div>
  );
}

function EditPanel() {
  const { key = '' } = useParams();
  const [detail, setDetail] = useState<AdminFactDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setDetail(null);
    getAdminFact(key)
      .then((body) => {
        if (!cancelled) setDetail(body.fact);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load the fact');
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (loadError !== null) return <Callout tone="bad">{loadError}</Callout>;
  if (detail === null) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <PageHeader title={detail.fact.label} lead={detail.key} />
      <AdminNav />
      <FactForm existing={detail} onSaved={(result) => setDetail(result.detail)} />

      <Section title="Used by">
        {detail.docs.length === 0 ? (
          <p className="text-muted">No guide uses this fact.</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5">
            {detail.docs.map((d) => (
              <li key={d.sourceId}>{d.sitePath === null ? d.title : <TextLink to={d.sitePath}>{d.title}</TextLink>}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="History">
        <TableScroll>
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">When</th>
                <th scope="col" className="px-3 py-2 font-medium">Value</th>
                <th scope="col" className="px-3 py-2 font-medium">Checked</th>
                <th scope="col" className="px-3 py-2 font-medium">By</th>
                <th scope="col" className="px-3 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {detail.history.map((h) => (
                <tr key={h.id} className="border-b border-line align-top">
                  <td className="px-3 py-2">{h.changedAt.slice(0, 10)}</td>
                  <td className="px-3 py-2">{formatFact(h.fact)}</td>
                  <td className="px-3 py-2">{h.fact.verifiedOn ?? 'Not checked'}</td>
                  <td className="px-3 py-2">{h.changedBy === 'system:seed' ? 'seed' : h.changedBy}</td>
                  <td className="px-3 py-2">{h.changeNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Section>
    </div>
  );
}

export function AdminFactNew() {
  return (
    <RequireAdmin>
      <NewPanel />
    </RequireAdmin>
  );
}

export function AdminFactEdit() {
  return (
    <RequireAdmin>
      <EditPanel />
    </RequireAdmin>
  );
}
