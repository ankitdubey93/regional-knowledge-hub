import { useState } from 'react';
import { ApiError } from '../lib/api';
import { commitTrialBalance, type LedgerAccountRecord, type LedgerImportRecord } from '../lib/ledger';
import { ACCOUNT_CLASSES, ACCOUNT_CLASS_LABELS, ACCOUNT_LABELS_CHECKED_ON, suggestClass, type AccountClass } from '@chub/shared/utils/accountClasses';
import { parseCsv } from '@chub/shared/utils/csv';
import { mapTrialBalance, suggestMapping, type TbMapping, type TbResult, type TbRow } from '@chub/shared/utils/ledgerImport';
import { formatMoney, type Currency } from '@chub/shared/utils/money';
import { Button, Callout, Field, inputClass, TableScroll } from './ui';

type Source = LedgerImportRecord['source'];
type Jurisdiction = 'AU' | 'UK' | 'AU+UK';
type Step = 1 | 2 | 3 | 4;

interface Props {
  clientId: string;
  jurisdiction: Jurisdiction;
  fyEndMonth: number | null;
  existing: LedgerAccountRecord[];
  onImported: () => void;
}

const SOURCES: { value: Source; label: string }[] = [
  { value: 'xero', label: 'Xero' },
  { value: 'qbo', label: 'QuickBooks Online' },
  { value: 'myob', label: 'MYOB' },
  { value: 'other', label: 'Other' },
];

const STEP_TITLES: Record<Step, string> = {
  1: 'Choose the file',
  2: 'Columns',
  3: 'Account types',
  4: 'Check and import',
};

const EMPTY_MAPPING: TbMapping = { headerRow: 0, code: null, name: 0, type: null, debit: null, credit: null, balance: null };

/** First day of the month after fyEndMonth, in the financial year that contains asAt. String and integer math only. */
function prefillStart(asAtValue: string, fyEndMonth: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asAtValue);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (fyEndMonth < 1 || fyEndMonth > 12 || month < 1 || month > 12) return null;
  const startMonth = (fyEndMonth % 12) + 1;
  const startYear = month >= startMonth ? year : year - 1;
  return `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
}

export function TbImportWizard({ clientId, jurisdiction, fyEndMonth, existing, onImported }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [fileKey, setFileKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [source, setSource] = useState<Source>('xero');
  const [asAt, setAsAt] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [chosenCurrency, setChosenCurrency] = useState<Currency>('AUD');
  const [readError, setReadError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [csvIssues, setCsvIssues] = useState<string[]>([]);
  const [mapping, setMapping] = useState<TbMapping>(EMPTY_MAPPING);
  const [tb, setTb] = useState<TbResult | null>(null);
  const [chosen, setChosen] = useState<Record<string, AccountClass | ''>>({});
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<{ rowCount: number; asAt: string; replaced: boolean } | null>(null);

  const currency: Currency = jurisdiction === 'AU' ? 'AUD' : jurisdiction === 'UK' ? 'GBP' : chosenCurrency;
  const existingByCode = new Map(existing.map((a) => [a.code, a] as const));
  const headerCells = rows[mapping.headerRow] ?? [];
  const previewRows = rows.slice(mapping.headerRow + 1, mapping.headerRow + 6);

  function setMap(patch: Partial<TbMapping>) {
    setMapping((m) => ({ ...m, ...patch }));
  }

  function defaultClass(row: TbRow): AccountClass | '' {
    const ex = existingByCode.get(row.code);
    if (ex && ex.classSetBy === 'user') return ex.accountClass;
    const suggested = suggestClass(row.sourceType);
    if (suggested !== null) return suggested;
    if (ex) return ex.accountClass;
    return '';
  }

  function onAsAtChange(value: string) {
    setAsAt(value);
    if (periodStart === '' && fyEndMonth !== null) {
      const start = prefillStart(value, fyEndMonth);
      if (start !== null) setPeriodStart(start);
    }
  }

  function resetWizard() {
    setStep(1);
    setFileKey((k) => k + 1);
    setFile(null);
    setFileName('');
    setCsvText('');
    setRows([]);
    setCsvIssues([]);
    setMapping(EMPTY_MAPPING);
    setTb(null);
    setChosen({});
    setReadError(null);
    setImportError(null);
  }

  async function readFile() {
    if (file === null) {
      setReadError('Choose a CSV file.');
      return;
    }
    if (asAt === '') {
      setReadError('Enter the as-at date.');
      return;
    }
    if (periodStart === '') {
      setReadError('Enter the financial year start.');
      return;
    }
    if (periodStart > asAt) {
      setReadError('The financial year start must be on or before the as-at date.');
      return;
    }
    setReadError(null);
    const text = await file.text();
    const parsed = parseCsv(text);
    const suggested = suggestMapping(parsed.rows) ?? { headerRow: 0, code: null, name: 0, type: null, debit: null, credit: null, balance: null };
    setCsvText(text);
    setFileName(file.name);
    setRows(parsed.rows);
    setCsvIssues(parsed.issues);
    setMapping(suggested);
    setStep(2);
  }

  function toTypes() {
    const result = mapTrialBalance(rows, mapping);
    const defaults: Record<string, AccountClass | ''> = {};
    for (const row of result.rows) defaults[row.code] = defaultClass(row);
    setTb(result);
    setChosen(defaults);
    setStep(3);
  }

  async function importTb() {
    if (tb === null) return;
    const classes: Record<string, AccountClass> = {};
    for (const row of tb.rows) {
      const c = chosen[row.code] ?? '';
      if (c !== '') classes[row.code] = c;
    }
    setBusy(true);
    setImportError(null);
    try {
      const res = await commitTrialBalance(clientId, {
        csvText,
        originalName: fileName,
        source,
        currency,
        asAt,
        periodStart,
        mapping,
        classes,
      });
      setResult({ rowCount: res.import.rowCount, asAt: res.import.asAt, replaced: res.supersededId !== null });
      resetWizard();
      onImported();
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'The import did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function columnSelect(label: string, value: number | null, onPick: (v: number | null) => void, nullable: boolean) {
    return (
      <Field label={label}>
        <select
          className={inputClass}
          value={value === null ? '' : String(value)}
          onChange={(e) => onPick(e.target.value === '' ? null : Number(e.target.value))}
        >
          {nullable && <option value="">Not in this file</option>}
          {headerCells.map((cell, i) => (
            <option key={i} value={String(i)}>
              {`${i + 1}: ${cell}`}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  // Derived for step 4. Totals come from the engine (Hard rule 4).
  const tbBlocks: string[] =
    tb === null
      ? []
      : [
          ...csvIssues,
          ...tb.issues.filter((i) => i.level === 'block').map((i) => i.message),
          ...tb.rows.filter((r) => (chosen[r.code] ?? '') === '').map((r) => `Account "${r.code} ${r.name}" needs a type.`),
        ];
  const tbWarnings = tb === null ? [] : tb.issues.filter((i) => i.level === 'warn').map((i) => i.message);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Import a trial balance</h2>

      {result !== null && (
        <Callout tone="good">
          <p>{`Imported ${result.rowCount} accounts as at ${result.asAt}.`}</p>
          {result.replaced && <p>(an earlier import at this date was replaced)</p>}
        </Callout>
      )}

      <p className="text-sm text-muted">{`Step ${step} of 4: ${STEP_TITLES[step]}`}</p>

      {step === 1 && (
        <div className="space-y-4">
          <Field label="Trial balance CSV">
            <input
              key={fileKey}
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="Exported from">
            <select
              className={inputClass}
              value={source}
              onChange={(e) => {
                const picked = SOURCES.find((s) => s.value === e.target.value);
                if (picked) setSource(picked.value);
              }}
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="As at">
            <input type="date" className={inputClass} value={asAt} onChange={(e) => onAsAtChange(e.target.value)} />
          </Field>
          <Field label="Financial year start" hint="Profit and loss figures run from this date to the as-at date.">
            <input type="date" className={inputClass} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </Field>
          {jurisdiction === 'AU+UK' && (
            <Field label="Currency">
              <select
                className={inputClass}
                value={chosenCurrency}
                onChange={(e) => {
                  if (e.target.value === 'AUD' || e.target.value === 'GBP') setChosenCurrency(e.target.value);
                }}
              >
                <option value="AUD">AUD</option>
                <option value="GBP">GBP</option>
              </select>
            </Field>
          )}
          {readError !== null && (
            <p role="alert" className="text-sm text-bad">
              {readError}
            </p>
          )}
          <div>
            <Button onClick={() => void readFile()}>Read file</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {ACCOUNT_LABELS_CHECKED_ON[source] !== null ? (
            <Callout>
              Columns and account types were checked against Xero&apos;s AU and UK demo company exports on {ACCOUNT_LABELS_CHECKED_ON[source]}. Your file may differ: check
              each column before you continue.
            </Callout>
          ) : (
            <Callout tone="warn">
              Column suggestions are not checked against a live export from this software. Check each column before you continue.
            </Callout>
          )}
          <Field label="Header row">
            <input
              type="number"
              min={1}
              step={1}
              className={inputClass}
              value={mapping.headerRow + 1}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1) setMap({ headerRow: n - 1 });
              }}
            />
          </Field>
          {columnSelect('Account code', mapping.code, (v) => setMap({ code: v }), true)}
          {columnSelect('Account name', mapping.name, (v) => {
            if (v !== null) setMap({ name: v });
          }, false)}
          {columnSelect('Account type', mapping.type, (v) => setMap({ type: v }), true)}
          {columnSelect('Debit', mapping.debit, (v) => setMap({ debit: v }), true)}
          {columnSelect('Credit', mapping.credit, (v) => setMap({ credit: v }), true)}
          {columnSelect('Balance', mapping.balance, (v) => setMap({ balance: v }), true)}
          <TableScroll>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {headerCells.map((cell, i) => (
                    <th key={i} scope="col" className="border-b border-line px-2 py-1 font-medium">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} className="border-b border-line px-2 py-1">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={toTypes}>Next</Button>
          </div>
        </div>
      )}

      {step === 3 && tb !== null && (
        <div className="space-y-4">
          <TableScroll>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Code</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Account</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Type in file</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {tb.rows.map((row) => (
                  <tr key={row.sourceRow}>
                    <td className="border-b border-line px-2 py-1">{row.code}</td>
                    <td className="border-b border-line px-2 py-1">{row.name}</td>
                    <td className="border-b border-line px-2 py-1">{row.sourceType}</td>
                    <td className="border-b border-line px-2 py-1">
                      <select
                        aria-label={`Type for ${row.code} ${row.name}`}
                        className={inputClass}
                        value={chosen[row.code] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          const picked = ACCOUNT_CLASSES.find((c) => c === v);
                          setChosen((prev) => ({ ...prev, [row.code]: picked ?? '' }));
                        }}
                      >
                        <option value="">Choose a type</option>
                        {ACCOUNT_CLASSES.map((c) => (
                          <option key={c} value={c}>
                            {ACCOUNT_CLASS_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => setStep(4)}>Next</Button>
          </div>
        </div>
      )}

      {step === 4 && tb !== null && (
        <div className="space-y-4">
          <dl className="flex flex-wrap gap-6 text-sm">
            <div>
              <dt className="text-muted">Debits</dt>
              <dd className="font-semibold">{formatMoney(tb.totalDebitCents, currency)}</dd>
            </div>
            <div>
              <dt className="text-muted">Credits</dt>
              <dd className="font-semibold">{formatMoney(tb.totalCreditCents, currency)}</dd>
            </div>
            <div>
              <dt className="text-muted">Accounts</dt>
              <dd className="font-semibold">{`${tb.rows.length} accounts`}</dd>
            </div>
          </dl>
          {tbBlocks.length > 0 && (
            <Callout tone="bad">
              <ul className="list-disc space-y-1 pl-5">
                {tbBlocks.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </Callout>
          )}
          {tbWarnings.length > 0 && (
            <Callout tone="warn">
              <ul className="list-disc space-y-1 pl-5">
                {tbWarnings.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </Callout>
          )}
          {importError !== null && (
            <p role="alert" className="text-sm text-bad">
              {importError}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button onClick={() => void importTb()} disabled={busy || tbBlocks.length > 0}>
              Import trial balance
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
