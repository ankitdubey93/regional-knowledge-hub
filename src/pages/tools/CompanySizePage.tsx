import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cents as factCents, count } from '../../data/facts';
import { FactValue } from '../../components/FactValue';
import { MoneyInput, cents } from '../../components/MoneyInput';
import { Button, Callout, Card, cx, Field, inputClass, PageHeader, Tabs, TableScroll } from '../../components/ui';
import { auProprietarySize, ukBandForYear, ukSizeOverYears, type SizeInputs, type UkSize } from '../../utils/companySize';
import { formatMoney } from '../../utils/money';
import { useHubScope } from '../../lib/hubScope';

const ukLimits = () => ({
  micro: { turnoverCents: factCents('uk.ca.microTurnover'), balanceSheetCents: factCents('uk.ca.microBalanceSheet'), employees: count('uk.ca.microEmployees') },
  small: { turnoverCents: factCents('uk.ca.smallTurnover'), balanceSheetCents: factCents('uk.ca.smallBalanceSheet'), employees: count('uk.ca.smallEmployees') },
  medium: { turnoverCents: factCents('uk.ca.mediumTurnover'), balanceSheetCents: factCents('uk.ca.mediumBalanceSheet'), employees: count('uk.ca.mediumEmployees') },
});

const ukMeaning: Record<UkSize, string> = {
  micro: 'Can use FRS 105 (or FRS 102 Section 1A). Audit exempt. Minimal notes and filing.',
  small: 'FRS 102 Section 1A. Usually audit exempt. Simplified directors\' report.',
  medium: 'Full FRS 102. Audit required. Directors\' and strategic reports.',
  large: 'Full FRS 102 or IFRS. Audit required. Full reporting.',
};

interface Year {
  key: number;
  turnover: string;
  balance: string;
  employees: string;
}
let key = 10;

function UkTab() {
  const [years, setYears] = useState<Year[]>([
    { key: 1, turnover: '8,000,000', balance: '3,000,000', employees: '30' },
    { key: 2, turnover: '20,000,000', balance: '9,000,000', employees: '60' },
    { key: 3, turnover: '9,000,000', balance: '4,000,000', employees: '35' },
  ]);
  const limits = ukLimits();
  const inputs: SizeInputs[] = years.map((y) => ({ turnoverCents: cents(y.turnover), balanceSheetCents: cents(y.balance), employees: Number(y.employees) || 0 }));
  const sizes = ukSizeOverYears(inputs, limits);
  const set = (k: number, patch: Partial<Year>) => setYears(years.map((y) => (y.key === k ? { ...y, ...patch } : y)));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Two of three conditions, each "not more than". Periods beginning on or after 6 April 2025. Small: turnover <FactValue factKey="uk.ca.smallTurnover" />, balance sheet{' '}
        <FactValue factKey="uk.ca.smallBalanceSheet" />, <FactValue factKey="uk.ca.smallEmployees" /> employees. Enter years oldest first, starting with the first financial year.
      </p>
      {years.map((y, i) => (
        <fieldset key={y.key} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[4rem_1fr_1fr_8rem_auto] sm:items-end">
          <legend className="sr-only">Year {i + 1}</legend>
          <p className="text-sm font-medium sm:pb-2">Year {i + 1}</p>
          <MoneyInput label="Turnover" prefix="£" value={y.turnover} onChange={(v) => set(y.key, { turnover: v })} />
          <MoneyInput label="Balance sheet total" prefix="£" value={y.balance} onChange={(v) => set(y.key, { balance: v })} />
          <Field label="Employees">
            <input className={inputClass} inputMode="numeric" value={y.employees} onChange={(e) => set(y.key, { employees: e.target.value })} />
          </Field>
          <button type="button" aria-label={`Remove year ${i + 1}`} disabled={years.length <= 1} onClick={() => setYears(years.filter((x) => x.key !== y.key))} className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-panel-2 disabled:opacity-30">
            <Trash2 size={16} aria-hidden />
          </button>
        </fieldset>
      ))}
      <Button variant="secondary" onClick={() => setYears([...years, { key: key++, turnover: '0', balance: '0', employees: '0' }])}>
        <Plus size={16} aria-hidden /> Add a year
      </Button>
      <TableScroll>
        <table className="w-full min-w-[28rem] text-sm" aria-live="polite">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-1.5 pr-3 font-medium">Year</th>
              <th className="py-1.5 pr-3 font-medium">Figures alone suggest</th>
              <th className="py-1.5 pr-3 font-medium">Company's size</th>
              <th className="py-1.5 font-medium">What it means</th>
            </tr>
          </thead>
          <tbody>
            {inputs.map((y, i) => {
              const alone = ukBandForYear(y, limits);
              const size = sizes[i]!;
              return (
                <tr key={i} className="border-b border-line align-top">
                  <td className="py-2 pr-3">{i + 1}</td>
                  <td className="py-2 pr-3 capitalize">{alone}</td>
                  <td className={cx('py-2 pr-3 font-semibold capitalize', alone !== size && 'text-warn')}>{size}</td>
                  <td className="py-2">
                    {ukMeaning[size]}
                    {alone !== size && <span className="block text-xs text-warn">Different from this year's figures because of the two-year rule.</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      <Callout>Public companies, banks, insurers and members of ineligible groups cannot use the small or micro regimes, whatever their size.</Callout>
    </div>
  );
}

function AuTab() {
  const [revenue, setRevenue] = useState('42,000,000');
  const [assets, setAssets] = useState('30,000,000');
  const [employees, setEmployees] = useState('120');
  const limits = { turnoverCents: factCents('au.corps.largePropRevenue'), balanceSheetCents: factCents('au.corps.largePropAssets'), employees: count('au.corps.largePropEmployees') };
  const r = auProprietarySize({ turnoverCents: cents(revenue), balanceSheetCents: cents(assets), employees: Number(employees) || 0 }, limits);
  const tests: [string, boolean][] = [
    [`Consolidated revenue ${formatMoney(limits.turnoverCents, 'AUD').replace('.00', '')} or more`, cents(revenue) >= limits.turnoverCents],
    [`Consolidated gross assets ${formatMoney(limits.balanceSheetCents, 'AUD').replace('.00', '')} or more`, cents(assets) >= limits.balanceSheetCents],
    [`${limits.employees} or more employees at year end`, (Number(employees) || 0) >= limits.employees],
  ];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          A proprietary company is large if it meets two of three tests (each "or more"), on a consolidated basis, each year on its own figures. Revenue{' '}
          <FactValue factKey="au.corps.largePropRevenue" />, gross assets <FactValue factKey="au.corps.largePropAssets" />, employees{' '}
          <FactValue factKey="au.corps.largePropEmployees" />.
        </p>
        <MoneyInput label="Consolidated revenue for the year" prefix="$" value={revenue} onChange={setRevenue} />
        <MoneyInput label="Consolidated gross assets at year end" prefix="$" value={assets} onChange={setAssets} />
        <Field label="Employees at year end (part-timers as a fraction)">
          <input className={inputClass} inputMode="decimal" value={employees} onChange={(e) => setEmployees(e.target.value)} />
        </Field>
      </div>
      <div aria-live="polite">
        <ul className="space-y-2 text-sm">
          {tests.map(([label, met]) => (
            <li key={label} className="flex items-center gap-2">
              <span className={cx('inline-flex size-5 items-center justify-center rounded-full text-xs', met ? 'bg-good-soft text-good' : 'bg-panel-2 text-muted')}>{met ? '✓' : '–'}</span>
              {label}
            </li>
          ))}
        </ul>
        <div className={cx('mt-4 rounded-lg p-4', r.size === 'large' ? 'bg-warn-soft' : 'bg-good-soft')}>
          <p className="text-lg font-semibold">{r.size === 'large' ? 'Large proprietary company' : 'Small proprietary company'}</p>
          <p className="mt-1 text-sm">
            {r.size === 'large'
              ? 'Must prepare an audited financial report and directors\' report and lodge them with ASIC within 4 months of year end.'
              : 'Usually no financial report is required, unless shareholders with 5% of votes or ASIC direct it, or it is foreign-controlled.'}
          </p>
        </div>
      </div>
    </div>
  );
}

export function CompanySizePage() {
  const [tab, setTab] = useState<'uk' | 'au'>('uk');
  const { scope } = useHubScope();
  const active = scope === 'AU' ? 'au' : scope === 'UK' ? 'uk' : tab;
  return (
    <div>
      <PageHeader title="Company size" lead="Which reporting regime a company falls into, from its turnover, balance sheet and staff." />
      <Card>
        {scope === 'all' && (
          <Tabs
            label="Country"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'uk', label: 'UK: Companies Act 2006' },
              { id: 'au', label: 'Australia: Corporations Act 2001' },
            ]}
          />
        )}
        {active === 'uk' ? <UkTab /> : <AuTab />}
      </Card>
    </div>
  );
}
