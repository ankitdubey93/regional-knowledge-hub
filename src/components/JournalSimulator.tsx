import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { accountName, accountsFor, journalScenarios } from '../data';
import type { Jurisdiction, JournalScenario } from '../data/schemas';
import { checkEntry, compareEntries, normalSide, tAccounts, trialBalance, type JournalLine, type LineFeedback } from '../utils/ledger';
import { formatPlain, parseMoney } from '../utils/money';
import { useProgress } from '../progress/ProgressContext';
import { TAccount } from './TAccount';
import { Button, Callout, Card, cx, inputClass, JurisdictionBadge, Tabs, TableScroll } from './ui';

interface Row {
  key: number;
  account: string;
  debit: string;
  credit: string;
}

let nextKey = 1;
const blankRow = (): Row => ({ key: nextKey++, account: '', debit: '', credit: '' });

/** Rows as typed → journal lines in cents. Unparseable amounts become NaN so checkEntry can flag them. */
function toLines(rows: Row[]): { lines: JournalLine[]; badAmounts: number[] } {
  const badAmounts: number[] = [];
  const lines = rows.map((r, i) => {
    const d = r.debit.trim() === '' ? 0 : parseMoney(r.debit);
    const c = r.credit.trim() === '' ? 0 : parseMoney(r.credit);
    if (d === null || c === null) badAmounts.push(i + 1);
    return { account: r.account, debitCents: d ?? 0, creditCents: c ?? 0 };
  });
  return { lines, badAmounts };
}

function describe(f: LineFeedback, j: Jurisdiction): string {
  const name = accountName(j, f.account);
  const side = (cents: number) => `${cents > 0 ? 'debit' : 'credit'} of ${formatPlain(Math.abs(cents))}`;
  switch (f.kind) {
    case 'correct':
      return `${name}: correct.`;
    case 'wrong-side':
      return `${name}: right amount, wrong side. It should be a ${side(f.expectedCents)}.`;
    case 'wrong-amount':
      return `${name}: the side is ${Math.sign(f.gotCents) === Math.sign(f.expectedCents) ? 'right' : 'wrong'}, but the amount is off: you have ${formatPlain(Math.abs(f.gotCents))}.`;
    case 'missing':
      return `${name}: this account should be in the entry.`;
    case 'extra':
      return `${name}: this account does not belong in this entry.`;
  }
}

function LinesEditor({ rows, setRows, jurisdiction }: { rows: Row[]; setRows: (r: Row[]) => void; jurisdiction: Jurisdiction }) {
  const accounts = accountsFor(jurisdiction);
  const set = (key: number, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const { lines } = toLines(rows);
  const totals = checkEntry(lines);
  return (
    <div>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] sm:border-0 sm:p-0">
            <label className="col-span-2 sm:col-span-1">
              <span className="sr-only">Line {i + 1} account</span>
              <select className={inputClass} value={r.account} onChange={(e) => set(r.key, { account: e.target.value })}>
                <option value="">Choose an account…</option>
                {(['asset', 'liability', 'equity', 'revenue', 'expense'] as const).map((type) => (
                  <optgroup key={type} label={`${type[0]!.toUpperCase()}${type.slice(1)} (increases with a ${normalSide(type)})`}>
                    {accounts
                      .filter((a) => a.type === type)
                      .map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Line {i + 1} debit</span>
              <input className={cx(inputClass, 'num text-right')} inputMode="decimal" placeholder="Debit" value={r.debit} onChange={(e) => set(r.key, { debit: e.target.value })} />
            </label>
            <label>
              <span className="sr-only">Line {i + 1} credit</span>
              <input className={cx(inputClass, 'num text-right')} inputMode="decimal" placeholder="Credit" value={r.credit} onChange={(e) => set(r.key, { credit: e.target.value })} />
            </label>
            <button
              type="button"
              aria-label={`Remove line ${i + 1}`}
              disabled={rows.length <= 2}
              onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
              className="col-span-2 inline-flex min-h-10 items-center justify-center rounded-lg text-muted hover:bg-panel-2 disabled:opacity-30 sm:col-span-1 sm:w-10"
            >
              <Trash2 size={16} aria-hidden />
              <span className="ml-2 sm:hidden">Remove line</span>
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setRows([...rows, blankRow()])}>
          <Plus size={16} aria-hidden /> Add line
        </Button>
        <p className="num text-sm" aria-live="polite">
          Dr {formatPlain(totals.totalDebitCents)} · Cr {formatPlain(totals.totalCreditCents)}{' '}
          <span className={totals.totalDebitCents === totals.totalCreditCents ? 'text-good' : 'text-bad'}>
            {totals.totalDebitCents === totals.totalCreditCents ? '(balanced)' : `(off by ${formatPlain(Math.abs(totals.totalDebitCents - totals.totalCreditCents))})`}
          </span>
        </p>
      </div>
    </div>
  );
}

function TAccountsGrid({ entries, jurisdiction }: { entries: JournalLine[][]; jurisdiction: Jurisdiction }) {
  const ts = tAccounts(entries);
  if (ts.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ts.map((t) => (
        <TAccount key={t.account} t={t} name={accountName(jurisdiction, t.account)} />
      ))}
    </div>
  );
}

function ScenarioMode({ scenarios }: { scenarios: JournalScenario[] }) {
  const { progress, update } = useProgress();
  const [id, setId] = useState(scenarios[0]!.id);
  const scenario = scenarios.find((s) => s.id === id) ?? scenarios[0]!;
  const [rows, setRows] = useState<Row[]>(() => [blankRow(), blankRow()]);
  const [result, setResult] = useState<null | { problems: string[]; feedback: LineFeedback[]; correct: boolean }>(null);
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  const answerLines: JournalLine[] = scenario.lines.map((l) => ({ account: l.account, debitCents: l.debit, creditCents: l.credit }));

  const choose = (s: JournalScenario) => {
    setId(s.id);
    setRows([blankRow(), blankRow()]);
    setResult(null);
    setShowHint(false);
    setShowAnswer(false);
  };

  const check = () => {
    const { lines, badAmounts } = toLines(rows);
    const basic = checkEntry(lines);
    const problems = [...badAmounts.map((n) => `Line ${n} has an amount that is not a number (use digits, at most 2 decimals).`), ...basic.problems];
    if (problems.length > 0) {
      setResult({ problems, feedback: [], correct: false });
      return;
    }
    const cmp = compareEntries(lines, answerLines);
    setResult({ problems: [], ...cmp });
    if (cmp.correct) update((p) => ({ ...p, journal: { ...p.journal, [scenario.id]: true } }));
  };

  const index = scenarios.findIndex((s) => s.id === id);
  const nextScenario = scenarios[index + 1];
  const solved = scenarios.filter((s) => progress.journal[s.id]).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Card className="p-3 sm:p-3 lg:self-start">
        <label className="block lg:hidden">
          <span className="mb-1 block text-sm font-medium">Scenario</span>
          <select className={inputClass} value={id} onChange={(e) => choose(scenarios.find((s) => s.id === e.target.value)!)}>
            {scenarios.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.title} ({s.jurisdiction}){progress.journal[s.id] ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="hidden lg:block">
          <p className="px-2 pb-2 text-sm text-muted">
            {solved}/{scenarios.length} solved
          </p>
          <ol className="max-h-[70vh] space-y-1 overflow-y-auto">
            {scenarios.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => choose(s)}
                  aria-current={s.id === id}
                  className={cx('flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm', s.id === id ? 'bg-accent-soft' : 'hover:bg-panel-2')}
                >
                  <span className="num w-5 shrink-0 text-muted">{i + 1}</span>
                  <span className="flex-1">{s.title}</span>
                  <span className="text-xs text-muted">{s.jurisdiction}</span>
                  {progress.journal[s.id] && <span className="text-good" aria-label="solved">✓</span>}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <div className="min-w-0 space-y-4">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <JurisdictionBadge j={scenario.jurisdiction} />
            <h2 className="font-semibold">{scenario.title}</h2>
          </div>
          <p className="mt-2">{scenario.prompt}</p>
          {showHint ? (
            <p className="mt-2 text-sm text-muted">Hint: {scenario.hint}</p>
          ) : (
            <button type="button" className="mt-2 text-sm text-accent underline" onClick={() => setShowHint(true)}>
              Show a hint
            </button>
          )}
        </Card>
        <Card>
          <LinesEditor rows={rows} setRows={setRows} jurisdiction={scenario.jurisdiction} />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={check}>Check my entry</Button>
            <Button variant="ghost" onClick={() => setShowAnswer((s) => !s)}>
              {showAnswer ? 'Hide answer' : 'Show answer'}
            </Button>
          </div>
        </Card>
        {result && (
          <div aria-live="polite" className="space-y-2">
            {result.problems.length > 0 && (
              <Callout tone="bad">
                <ul className="list-disc pl-5">
                  {result.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Callout>
            )}
            {result.problems.length === 0 && (
              <Callout tone={result.correct ? 'good' : 'warn'}>
                <p className="font-medium">{result.correct ? 'Correct.' : 'It balances, but it is not the right entry yet.'}</p>
                {!result.correct && (
                  <ul className="mt-1 list-disc pl-5">
                    {result.feedback
                      .filter((f) => f.kind !== 'correct')
                      .map((f) => (
                        <li key={f.account + f.kind}>{describe(f, scenario.jurisdiction)}</li>
                      ))}
                  </ul>
                )}
                {result.correct && <p className="mt-1">{scenario.explanation}</p>}
              </Callout>
            )}
            {result.correct && nextScenario && (
              <Button variant="secondary" onClick={() => choose(nextScenario)}>
                Next scenario
              </Button>
            )}
          </div>
        )}
        {showAnswer && (
          <Card>
            <h3 className="mb-2 font-semibold">Answer</h3>
            <TableScroll>
              <table className="w-full min-w-[24rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-1.5 pr-3 font-medium">Account</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Debit</th>
                    <th className="py-1.5 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {scenario.lines.map((l) => (
                    <tr key={l.account} className="border-b border-line">
                      <td className="py-1.5 pr-3">{accountName(scenario.jurisdiction, l.account)}</td>
                      <td className="num py-1.5 pr-3 text-right">{l.debit ? formatPlain(l.debit) : ''}</td>
                      <td className="num py-1.5 text-right">{l.credit ? formatPlain(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <p className="mt-3 text-sm">{scenario.explanation}</p>
            <div className="mt-4">
              <TAccountsGrid entries={[answerLines]} jurisdiction={scenario.jurisdiction} />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function FreePlay() {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>('INTL');
  const [rows, setRows] = useState<Row[]>(() => [blankRow(), blankRow()]);
  const [entries, setEntries] = useState<JournalLine[][]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const tb = useMemo(() => trialBalance(entries), [entries]);

  const post = () => {
    const { lines, badAmounts } = toLines(rows);
    const c = checkEntry(lines);
    const all = [...badAmounts.map((n) => `Line ${n} has an amount that is not a number.`), ...c.problems];
    setProblems(all);
    if (all.length === 0) {
      setEntries((e) => [...e, lines.filter((l) => l.account !== '')]);
      setRows([blankRow(), blankRow()]);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label>
            <span className="mb-1 block text-sm font-medium">Chart of accounts</span>
            <select
              className={inputClass}
              value={jurisdiction}
              onChange={(e) => {
                setJurisdiction(e.target.value as Jurisdiction);
                setEntries([]);
                setRows([blankRow(), blankRow()]);
              }}
            >
              <option value="INTL">Generic</option>
              <option value="AU">Australia (Xero-style)</option>
              <option value="UK">United Kingdom (Xero-style)</option>
            </select>
          </label>
          <p className="text-sm text-muted">Post any entries you like. Switching charts clears the ledger.</p>
        </div>
        <LinesEditor rows={rows} setRows={setRows} jurisdiction={jurisdiction} />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={post}>Post entry</Button>
          <Button variant="ghost" disabled={entries.length === 0} onClick={() => setEntries([])}>
            Clear ledger
          </Button>
        </div>
        {problems.length > 0 && (
          <div className="mt-3">
            <Callout tone="bad">
              <ul className="list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Callout>
          </div>
        )}
      </Card>
      {entries.length > 0 && (
        <>
          <Card>
            <h2 className="mb-3 font-semibold">T-accounts ({entries.length} entries)</h2>
            <TAccountsGrid entries={entries} jurisdiction={jurisdiction} />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Trial balance</h2>
            <TableScroll>
              <table className="w-full min-w-[24rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-1.5 pr-3 font-medium">Account</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Debit</th>
                    <th className="py-1.5 text-right font-medium">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {tb.rows.map((r) => (
                    <tr key={r.account} className="border-b border-line">
                      <td className="py-1.5 pr-3">{accountName(jurisdiction, r.account)}</td>
                      <td className="num py-1.5 pr-3 text-right">{r.debitCents ? formatPlain(r.debitCents) : ''}</td>
                      <td className="num py-1.5 text-right">{r.creditCents ? formatPlain(r.creditCents) : ''}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-1.5 pr-3">Total</td>
                    <td className="num py-1.5 pr-3 text-right">{formatPlain(tb.totalDebitCents)}</td>
                    <td className="num py-1.5 text-right">{formatPlain(tb.totalCreditCents)}</td>
                  </tr>
                </tbody>
              </table>
            </TableScroll>
          </Card>
        </>
      )}
    </div>
  );
}

export function JournalSimulator({ scenarios = journalScenarios }: { scenarios?: JournalScenario[] } = {}) {
  const [mode, setMode] = useState<'scenarios' | 'free'>('scenarios');
  return (
    <div>
      <Tabs
        label="Simulator mode"
        value={mode}
        onChange={setMode}
        tabs={[
          { id: 'scenarios', label: 'Scenarios' },
          { id: 'free', label: 'Free play' },
        ]}
      />
      {mode === 'scenarios' ? <ScenarioMode scenarios={scenarios} /> : <FreePlay />}
    </div>
  );
}
