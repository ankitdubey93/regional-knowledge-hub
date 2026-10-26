import { useState } from 'react';
import { Landmark, FileText, Receipt } from 'lucide-react';
import { accountName, accountsFor, codingScenarios, taxCodes } from '../../data';
import { useProgress } from '../../progress/ProgressContext';
import { formatMoney } from '../../utils/money';
import { Button, Callout, Card, cx, Field, inputClass, JurisdictionBadge, PageHeader, Tabs, TextLink } from '../../components/ui';

type Region = 'AU' | 'UK';

export function CodingPage() {
  const { progress, update } = useProgress();
  const [region, setRegion] = useState<Region>('AU');
  const list = codingScenarios.filter((s) => s.jurisdiction === region);
  const [index, setIndex] = useState(0);
  const [account, setAccount] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [result, setResult] = useState<null | { exact: boolean; accountOk: boolean; taxOk: boolean }>(null);
  const [attempted, setAttempted] = useState(false);

  const s = list[index]!;
  const codes = taxCodes[region];
  const accounts = accountsFor(region);
  const nameOfTax = (code: string) => codes.find((t) => t.code === code)?.name ?? code;

  const resetPick = () => {
    setAccount('');
    setTaxCode('');
    setResult(null);
    setAttempted(false);
  };

  const check = () => {
    const accepted = [s.answer, ...s.alsoAccepted];
    const exact = accepted.some((a) => a.account === account && a.taxCode === taxCode);
    const accountOk = accepted.some((a) => a.account === account);
    const taxOk = accepted.some((a) => a.taxCode === taxCode);
    setResult({ exact, accountOk, taxOk });
    if (!attempted) {
      // Only the first try counts towards "right first time".
      update((p) => ({ ...p, coding: { ...p.coding, [s.id]: exact } }));
      setAttempted(true);
    }
  };

  const Icon = s.source === 'bank' ? Landmark : s.source === 'invoice' ? FileText : Receipt;
  const right = list.filter((x) => progress.coding[x.id]).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Coding scenarios"
        lead={
          <>
            Code each document the way you would in Xero: the account and the tax rate. Read{' '}
            <TextLink to={region === 'AU' ? '/learn/australia/bas-gst-guide' : '/learn/uk/mtd-vat-guide'}>{region === 'AU' ? 'GST and the BAS' : 'VAT and MTD'}</TextLink> first.
          </>
        }
      />
      <Tabs
        label="Country"
        value={region}
        onChange={(r) => {
          setRegion(r);
          setIndex(0);
          resetPick();
        }}
        tabs={[
          { id: 'AU', label: 'Australia' },
          { id: 'UK', label: 'United Kingdom' },
        ]}
      />
      <p className="text-sm text-muted">
        Scenario {index + 1} of {list.length} · {right} right first time
      </p>

      <Card>
        <div className="flex items-start gap-3">
          <Icon size={22} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <JurisdictionBadge j={s.jurisdiction} />
              <span className="text-xs uppercase tracking-wide text-muted">{s.source === 'bank' ? 'Bank line' : s.source === 'invoice' ? 'Sales invoice' : 'Supplier bill'}</span>
              <span className="text-xs text-muted">{s.date}</span>
            </div>
            <p className="mt-2 font-semibold">{s.from}</p>
            <p className="mt-1">{s.description}</p>
          </div>
          <p className="num shrink-0 text-lg font-semibold">{formatMoney(s.amountCents, region === 'AU' ? 'AUD' : 'GBP')}</p>
        </div>
      </Card>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account">
            <select className={cx(inputClass, result && (result.accountOk ? 'border-good' : 'border-bad'))} value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">Choose…</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={region === 'AU' ? 'GST rate' : 'VAT rate'}>
            <select className={cx(inputClass, result && (result.taxOk ? 'border-good' : 'border-bad'))} value={taxCode} onChange={(e) => setTaxCode(e.target.value)}>
              <option value="">Choose…</option>
              {codes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {taxCode && <p className="mt-2 text-xs text-muted">{codes.find((t) => t.code === taxCode)?.useFor} Reports in: {codes.find((t) => t.code === taxCode)?.reportsIn}.</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={check} disabled={!account || !taxCode}>
            Check
          </Button>
          {index + 1 < list.length && (
            <Button
              variant="secondary"
              onClick={() => {
                setIndex(index + 1);
                resetPick();
              }}
            >
              Next
            </Button>
          )}
        </div>
      </Card>

      {result && (
        <div aria-live="polite">
          <Callout tone={result.exact ? 'good' : 'warn'}>
            <p className="font-medium">
              {result.exact
                ? 'Right.'
                : `${result.accountOk ? 'Account right' : 'Account not right'}, ${result.taxOk ? 'tax rate right' : 'tax rate not right'}.`}
            </p>
            <p className="mt-1">
              Answer: {accountName(region, s.answer.account)} with {nameOfTax(s.answer.taxCode)}.
              {s.alsoAccepted.length > 0 && ` Also accepted: ${s.alsoAccepted.map((a) => `${accountName(region, a.account)} with ${nameOfTax(a.taxCode)}`).join('; ')}.`}
            </p>
            <p className="mt-1">{s.explanation}</p>
          </Callout>
        </div>
      )}
      <p className="text-xs text-muted">{taxCodes.note}</p>
    </div>
  );
}
