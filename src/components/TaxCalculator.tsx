import { useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cents as factCents, rateBp } from '../data/facts';
import { basWorksheet, gstFromInclusive, gstOnExclusive, type BasTransaction, type PurchaseTreatment, type SaleTreatment } from '../utils/gst';
import { vat100, vatFromGross, type VatPurchaseTreatment, type VatSaleTreatment, type VatTransaction } from '../utils/vat';
import { cisDeduction, employerNic, superGuarantee } from '../utils/payroll';
import { formatMoney, formatRate, parseMoney } from '../utils/money';
import { cents, MoneyInput } from './MoneyInput';
import { FactValue } from './FactValue';
import { Button, Card, cx, inputClass, Tabs, TableScroll } from './ui';
import { inScope, type HubScope } from '../lib/scope';

type TabId = 'gst' | 'bas' | 'vat' | 'super' | 'nic' | 'cis';
const TABS: { id: TabId; label: string }[] = [
  { id: 'gst', label: 'AU GST' },
  { id: 'bas', label: 'AU BAS' },
  { id: 'super', label: 'AU Super' },
  { id: 'vat', label: 'UK VAT return' },
  { id: 'nic', label: 'UK Employer NIC' },
  { id: 'cis', label: 'UK CIS' },
];
const TAB_JURISDICTION: Record<TabId, 'AU' | 'UK'> = { gst: 'AU', bas: 'AU', super: 'AU', vat: 'UK', nic: 'UK', cis: 'UK' };

const aud = (c: number) => formatMoney(c, 'AUD');
const gbp = (c: number) => formatMoney(c, 'GBP');

function Result({ rows }: { rows: [ReactNode, string, boolean?][] }) {
  return (
    <dl className="mt-4 divide-y divide-line rounded-lg border border-line" aria-live="polite">
      {rows.map(([label, value, strong], i) => (
        <div key={i} className={cx('flex items-center justify-between gap-4 px-3 py-2', strong && 'bg-panel-2 font-semibold')}>
          <dt className="text-sm">{label}</dt>
          <dd className="num text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function GstTab() {
  const rate = rateBp('au.gst.rate');
  const [amount, setAmount] = useState('1,100');
  const [mode, setMode] = useState<'inclusive' | 'exclusive'>('inclusive');
  const c = cents(amount);
  const gst = mode === 'inclusive' ? gstFromInclusive(c, rate) : gstOnExclusive(c, rate);
  const net = mode === 'inclusive' ? c - gst : c;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          GST rate: <FactValue factKey="au.gst.rate" />. A GST-inclusive price contains 1/11 GST.
        </p>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-1 text-sm font-medium">The amount I have is</legend>
          {(['inclusive', 'exclusive'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="gst-mode" checked={mode === m} onChange={() => setMode(m)} className="accent-[var(--accent)]" />
              GST-{m}
            </label>
          ))}
        </fieldset>
        <MoneyInput label="Amount" prefix="$" value={amount} onChange={setAmount} />
      </div>
      <Result
        rows={[
          ['Price excluding GST', aud(net)],
          ['GST', aud(gst)],
          ['Price including GST', aud(net + gst), true],
        ]}
      />
    </div>
  );
}

interface BasRow {
  key: number;
  kind: 'sale' | 'purchase';
  amount: string;
  treatment: SaleTreatment | PurchaseTreatment;
  capital: boolean;
  label: string;
}
let basKey = 100;
const basSample: BasRow[] = [
  { key: 1, kind: 'sale', amount: '11,000', treatment: 'taxable', capital: false, label: 'Design work invoiced' },
  { key: 2, kind: 'sale', amount: '2,000', treatment: 'export', capital: false, label: 'Goods exported to NZ' },
  { key: 3, kind: 'sale', amount: '300', treatment: 'input-taxed', capital: false, label: 'Interest received' },
  { key: 4, kind: 'purchase', amount: '3,300', treatment: 'taxable', capital: true, label: 'New laptop' },
  { key: 5, kind: 'purchase', amount: '2,200', treatment: 'taxable', capital: false, label: 'Office rent' },
  { key: 6, kind: 'purchase', amount: '40', treatment: 'gst-free', capital: false, label: 'Bank fees' },
  { key: 7, kind: 'purchase', amount: '5,000', treatment: 'bas-excluded', capital: false, label: 'Wages' },
];
const saleTreatments: { id: SaleTreatment; label: string }[] = [
  { id: 'taxable', label: 'Taxable (GST on Income)' },
  { id: 'export', label: 'Export (GST-free)' },
  { id: 'gst-free', label: 'Other GST-free' },
  { id: 'input-taxed', label: 'Input-taxed' },
  { id: 'bas-excluded', label: 'BAS excluded' },
];
const purchaseTreatments: { id: PurchaseTreatment; label: string }[] = [
  { id: 'taxable', label: 'Taxable (GST on Expenses)' },
  { id: 'gst-free', label: 'GST-free' },
  { id: 'input-taxed', label: 'Input-taxed (no credit)' },
  { id: 'bas-excluded', label: 'BAS excluded' },
];

function BasTab() {
  const rate = rateBp('au.gst.rate');
  const [rows, setRows] = useState<BasRow[]>(basSample);
  const set = (key: number, patch: Partial<BasRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const txns: BasTransaction[] = rows.map((r) =>
    r.kind === 'sale'
      ? { id: String(r.key), kind: 'sale', inclusiveCents: cents(r.amount), treatment: r.treatment as SaleTreatment }
      : { id: String(r.key), kind: 'purchase', inclusiveCents: cents(r.amount), treatment: r.treatment as PurchaseTreatment, capital: r.capital },
  );
  const w = basWorksheet(txns, rate);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Amounts include GST. Edit the sample period or add your own lines. GST is worked out per line at <FactValue factKey="au.gst.rate" />, the way software does it.
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2 lg:grid-cols-[minmax(0,1fr)_7rem_8rem_minmax(0,14rem)_6rem_auto] lg:items-center">
            <input aria-label={`Line ${i + 1} description`} className={cx(inputClass, 'col-span-2 lg:col-span-1')} value={r.label} onChange={(e) => set(r.key, { label: e.target.value })} />
            <select
              aria-label={`Line ${i + 1} type`}
              className={inputClass}
              value={r.kind}
              onChange={(e) => set(r.key, { kind: e.target.value as BasRow['kind'], treatment: 'taxable', capital: false })}
            >
              <option value="sale">Sale</option>
              <option value="purchase">Purchase</option>
            </select>
            <input aria-label={`Line ${i + 1} amount including GST`} inputMode="decimal" className={cx(inputClass, 'num text-right', parseMoney(r.amount) === null && 'border-bad')} value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value })} />
            <select aria-label={`Line ${i + 1} GST treatment`} className={cx(inputClass, 'col-span-2 lg:col-span-1')} value={r.treatment} onChange={(e) => set(r.key, { treatment: e.target.value as BasRow['treatment'] })}>
              {(r.kind === 'sale' ? saleTreatments : purchaseTreatments).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className={cx('flex items-center gap-2 text-sm', r.kind === 'sale' && 'invisible')}>
              <input type="checkbox" checked={r.capital} onChange={(e) => set(r.key, { capital: e.target.checked })} className="accent-[var(--accent)]" disabled={r.kind === 'sale'} />
              Capital
            </label>
            <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="inline-flex min-h-10 items-center justify-center rounded-lg text-muted hover:bg-panel-2 lg:w-10">
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setRows([...rows, { key: basKey++, kind: 'purchase', amount: '0', treatment: 'taxable', capital: false, label: 'New line' }])}>
          <Plus size={16} aria-hidden /> Add line
        </Button>
        <Button variant="ghost" onClick={() => setRows(basSample)}>
          Reset sample
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Result
          rows={[
            ['G1 Total sales (incl. GST)', aud(w.G1)],
            ['G2 Export sales', aud(w.G2)],
            ['G3 Other GST-free sales', aud(w.G3)],
            ['G4 Input-taxed sales', aud(w.G4)],
            ['G10 Capital purchases', aud(w.G10)],
            ['G11 Non-capital purchases', aud(w.G11)],
          ]}
        />
        <Result
          rows={[
            ['1A GST on sales', aud(w['1A'])],
            ['1B GST on purchases', aud(w['1B'])],
            [w.net >= 0 ? 'Net GST payable to the ATO' : 'Net GST refund from the ATO', aud(Math.abs(w.net)), true],
          ]}
        />
      </div>
      <p className="text-xs text-muted">Simplified: G13–G15 (purchases for input-taxed sales, private use) and the non-GST sections of the BAS are not modelled. Simpler BAS reports only G1, 1A and 1B.</p>
    </div>
  );
}

interface VatRow {
  key: number;
  kind: 'sale' | 'purchase';
  amount: string;
  treatment: VatSaleTreatment | VatPurchaseTreatment;
  label: string;
}
let vatKey = 100;
const vatSample: VatRow[] = [
  { key: 1, kind: 'sale', amount: '10,000', treatment: 'standard', label: 'Consultancy' },
  { key: 2, kind: 'sale', amount: '1,500', treatment: 'zero', label: 'Printed books' },
  { key: 3, kind: 'purchase', amount: '2,000', treatment: 'standard', label: 'Laptop' },
  { key: 4, kind: 'purchase', amount: '600', treatment: 'exempt', label: 'Insurance' },
  { key: 5, kind: 'purchase', amount: '4,000', treatment: 'reverse-charge', label: 'Plasterer (construction reverse charge)' },
  { key: 6, kind: 'purchase', amount: '6,000', treatment: 'outside-scope', label: 'Salaries' },
];
const vatSaleT: { id: VatSaleTreatment; label: string }[] = [
  { id: 'standard', label: 'Standard rate' },
  { id: 'reduced', label: 'Reduced rate' },
  { id: 'zero', label: 'Zero-rated' },
  { id: 'exempt', label: 'Exempt' },
  { id: 'reverse-charge-supply', label: 'Reverse charge supply (you are the supplier)' },
  { id: 'outside-scope', label: 'Outside the scope' },
];
const vatPurchaseT: { id: VatPurchaseTreatment; label: string }[] = [
  { id: 'standard', label: 'Standard rate' },
  { id: 'reduced', label: 'Reduced rate' },
  { id: 'zero', label: 'Zero-rated' },
  { id: 'exempt', label: 'Exempt' },
  { id: 'reverse-charge', label: 'Construction reverse charge (you are the customer)' },
  { id: 'outside-scope', label: 'Outside the scope' },
];

function VatTab() {
  const rates = { standardBp: rateBp('uk.vat.standardRate'), reducedBp: rateBp('uk.vat.reducedRate') };
  const [rows, setRows] = useState<VatRow[]>(vatSample);
  const [gross, setGross] = useState('120');
  const set = (key: number, patch: Partial<VatRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const txns = rows.map((r) => ({ id: String(r.key), kind: r.kind, netCents: cents(r.amount), treatment: r.treatment }) as VatTransaction);
  const v = vat100(txns, rates);
  const grossVat = vatFromGross(cents(gross), rates.standardBp);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Amounts are <strong>net of VAT</strong>. Standard rate <FactValue factKey="uk.vat.standardRate" />, reduced rate <FactValue factKey="uk.vat.reducedRate" />.
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2 lg:grid-cols-[minmax(0,1fr)_7rem_8rem_minmax(0,16rem)_auto] lg:items-center">
            <input aria-label={`Line ${i + 1} description`} className={cx(inputClass, 'col-span-2 lg:col-span-1')} value={r.label} onChange={(e) => set(r.key, { label: e.target.value })} />
            <select aria-label={`Line ${i + 1} type`} className={inputClass} value={r.kind} onChange={(e) => set(r.key, { kind: e.target.value as VatRow['kind'], treatment: 'standard' })}>
              <option value="sale">Sale</option>
              <option value="purchase">Purchase</option>
            </select>
            <input aria-label={`Line ${i + 1} net amount`} inputMode="decimal" className={cx(inputClass, 'num text-right', parseMoney(r.amount) === null && 'border-bad')} value={r.amount} onChange={(e) => set(r.key, { amount: e.target.value })} />
            <select aria-label={`Line ${i + 1} VAT treatment`} className={cx(inputClass, 'col-span-2 lg:col-span-1')} value={r.treatment} onChange={(e) => set(r.key, { treatment: e.target.value as VatRow['treatment'] })}>
              {(r.kind === 'sale' ? vatSaleT : vatPurchaseT).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="col-span-2 inline-flex min-h-10 items-center justify-center rounded-lg text-muted hover:bg-panel-2 lg:col-span-1 lg:w-10">
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setRows([...rows, { key: vatKey++, kind: 'purchase', amount: '0', treatment: 'standard', label: 'New line' }])}>
          <Plus size={16} aria-hidden /> Add line
        </Button>
        <Button variant="ghost" onClick={() => setRows(vatSample)}>
          Reset sample
        </Button>
      </div>
      <TableScroll>
        <table className="w-full min-w-[22rem] text-sm" aria-live="polite">
          <caption className="mb-2 text-left font-semibold">VAT return (VAT 100)</caption>
          <tbody>
            {(
              [
                ['Box 1', 'VAT due on sales and other outputs', v.box1],
                ['Box 2', 'VAT due on EU acquisitions (Northern Ireland only)', v.box2],
                ['Box 3', 'Total VAT due (box 1 + box 2)', v.box3],
                ['Box 4', 'VAT reclaimed on purchases', v.box4],
                ['Box 5', v.box5 >= 0 ? 'Net VAT to pay HMRC' : 'Net VAT to reclaim', Math.abs(v.box5)],
                ['Box 6', 'Total sales excluding VAT (whole £)', v.box6],
                ['Box 7', 'Total purchases excluding VAT (whole £)', v.box7],
                ['Box 8', 'Goods supplied to the EU (NI only)', v.box8],
                ['Box 9', 'Goods acquired from the EU (NI only)', v.box9],
              ] as const
            ).map(([box, label, val]) => (
              <tr key={box} className={cx('border-b border-line', box === 'Box 5' && 'bg-panel-2 font-semibold')}>
                <th scope="row" className="w-16 py-2 pr-3 text-left font-medium">
                  {box}
                </th>
                <td className="py-2 pr-3">{label}</td>
                <td className="num py-2 text-right">{gbp(val)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <div className="rounded-lg bg-panel-2 p-3">
        <MoneyInput label="Quick check: VAT inside a gross price at the standard rate" prefix="£" value={gross} onChange={setGross} />
        <p className="num mt-2 text-sm">
          VAT {gbp(grossVat)} · net {gbp(cents(gross) - grossVat)}
        </p>
      </div>
    </div>
  );
}

function SuperTab() {
  const [pay, setPay] = useState('2,000');
  const [ytd, setYtd] = useState('0');
  const r = superGuarantee({
    qualifyingEarningsCents: cents(pay),
    earningsSoFarThisYearCents: cents(ytd),
    rateBp: rateBp('au.super.guaranteeRate'),
    maxContributionBaseAnnualCents: factCents('au.super.maxContributionBaseAnnual'),
  });
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Super guarantee <FactValue factKey="au.super.guaranteeRate" /> on qualifying earnings, up to the annual maximum contribution base of{' '}
          <FactValue factKey="au.super.maxContributionBaseAnnual" />. Under Payday Super (from <FactValue factKey="au.super.paydaySuperStart" />) it is due with each pay run.
        </p>
        <MoneyInput label="Qualifying earnings this payday" prefix="$" value={pay} onChange={setPay} />
        <MoneyInput label="Qualifying earnings already paid this financial year" prefix="$" value={ytd} onChange={setYtd} hint="Used for the maximum contribution base." />
      </div>
      <Result
        rows={[
          ['Earnings super is calculated on', aud(r.liableEarningsCents)],
          ['Earnings above the maximum base', aud(r.cappedCents)],
          [`Super guarantee at ${formatRate(rateBp('au.super.guaranteeRate'))}`, aud(r.superCents), true],
        ]}
      />
    </div>
  );
}

function NicTab() {
  const [salaries, setSalaries] = useState<string[]>(['30,000', '45,000', '4,000']);
  const [claims, setClaims] = useState(true);
  const r = employerNic({
    annualEarningsCents: salaries.map(cents),
    secondaryThresholdAnnualCents: factCents('uk.nic.secondaryThresholdAnnual'),
    rateBp: rateBp('uk.nic.employerRate'),
    employmentAllowanceCents: factCents('uk.nic.employmentAllowance'),
    claimsAllowance: claims,
  });
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Employer NIC <FactValue factKey="uk.nic.employerRate" /> above <FactValue factKey="uk.nic.secondaryThresholdAnnual" /> a year per employee, less the Employment Allowance of up to{' '}
          <FactValue factKey="uk.nic.employmentAllowance" />. Worked on annual pay for teaching; real payroll uses each pay period's threshold, and under-21s, apprentices and veterans are not modelled.
        </p>
        {salaries.map((s, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <MoneyInput label={`Employee ${i + 1}: annual pay`} prefix="£" value={s} onChange={(v) => setSalaries(salaries.map((x, j) => (j === i ? v : x)))} />
            </div>
            <button type="button" aria-label={`Remove employee ${i + 1}`} disabled={salaries.length <= 1} onClick={() => setSalaries(salaries.filter((_, j) => j !== i))} className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-panel-2 disabled:opacity-30">
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        ))}
        <Button variant="secondary" onClick={() => setSalaries([...salaries, '25,000'])}>
          <Plus size={16} aria-hidden /> Add employee
        </Button>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={claims} onChange={(e) => setClaims(e.target.checked)} className="mt-1 accent-[var(--accent)]" />
          Claim the Employment Allowance (not available where the only employee paid above the threshold is a director)
        </label>
      </div>
      <Result
        rows={[
          ...r.perEmployeeCents.map((c, i) => [`Employee ${i + 1}`, gbp(c)] as [string, string]),
          ['Employer NIC before allowance', gbp(r.grossCents)],
          ['Employment Allowance used', `−${gbp(r.allowanceUsedCents)}`],
          ['Employer NIC payable for the year', gbp(r.payableCents), true],
        ]}
      />
    </div>
  );
}

function CisTab() {
  const [gross, setGross] = useState('2,500');
  const [materials, setMaterials] = useState('500');
  const [vat, setVat] = useState('0');
  const [status, setStatus] = useState<'registered' | 'unregistered' | 'gross'>('registered');
  const bp = status === 'gross' ? 0 : rateBp(status === 'registered' ? 'uk.cis.registeredRate' : 'uk.cis.unregisteredRate');
  const r = cisDeduction({ grossExVatCents: cents(gross), materialsCents: cents(materials), vatCents: cents(vat), rateBp: bp });
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          CIS is deducted from the <strong>labour</strong> part of a subcontractor's invoice: <FactValue factKey="uk.cis.registeredRate" /> if registered and verified,{' '}
          <FactValue factKey="uk.cis.unregisteredRate" /> if not, 0% with gross payment status.
        </p>
        <MoneyInput label="Invoice total excluding VAT" prefix="£" value={gross} onChange={setGross} />
        <MoneyInput label="Of which: materials bought by the subcontractor" prefix="£" value={materials} onChange={setMaterials} />
        <MoneyInput label="VAT on the invoice (0 if reverse charge or not registered)" prefix="£" value={vat} onChange={setVat} />
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Subcontractor status (HMRC verification)</legend>
          {(
            [
              ['registered', 'Registered and verified'],
              ['unregistered', 'Not registered or not verified'],
              ['gross', 'Gross payment status'],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="flex items-center gap-2 text-sm">
              <input type="radio" name="cis-status" checked={status === id} onChange={() => setStatus(id)} className="accent-[var(--accent)]" />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
      <Result
        rows={[
          ['Labour (deduction base)', gbp(r.labourCents)],
          [`CIS deduction at ${formatRate(bp)}`, gbp(r.deductionCents)],
          ['Pay to the subcontractor', gbp(r.payToSubcontractorCents), true],
          ['Pay to HMRC (with PAYE)', gbp(r.deductionCents)],
        ]}
      />
    </div>
  );
}

export function TaxCalculator({ initial = 'gst', scope = 'all' }: { initial?: TabId; scope?: HubScope }) {
  const tabs = TABS.filter((t) => inScope(TAB_JURISDICTION[t.id], scope));
  const [tab, setTab] = useState<TabId>(initial);
  const active = tabs.some((t) => t.id === tab) ? tab : tabs[0]!.id;
  return (
    <Card>
      <Tabs label="Calculator" tabs={tabs} value={active} onChange={setTab} />
      {active === 'gst' && <GstTab />}
      {active === 'bas' && <BasTab />}
      {active === 'vat' && <VatTab />}
      {active === 'super' && <SuperTab />}
      {active === 'nic' && <NicTab />}
      {active === 'cis' && <CisTab />}
    </Card>
  );
}
