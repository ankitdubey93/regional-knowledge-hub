import { useState } from 'react';
import { MoneyInput, cents } from '../../components/MoneyInput';
import { Callout, Card, Field, inputClass, PageHeader, TableScroll, TextLink } from '../../components/ui';
import { reducingBalance, straightLine, type DepreciationYear } from '../../utils/depreciation';
import { formatPlain } from '../../utils/money';

function Schedule({ title, rows }: { title: string; rows: DepreciationYear[] }) {
  const total = rows.reduce((a, r) => a + r.chargeCents, 0);
  return (
    <Card>
      <h2 className="mb-3 font-semibold">{title}</h2>
      <TableScroll>
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-1.5 pr-3 font-medium">Year</th>
              <th className="py-1.5 pr-3 text-right font-medium">Opening</th>
              <th className="py-1.5 pr-3 text-right font-medium">Charge</th>
              <th className="py-1.5 text-right font-medium">Closing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year} className="border-b border-line">
                <td className="py-1.5 pr-3">{r.year}</td>
                <td className="num py-1.5 pr-3 text-right">{formatPlain(r.openingCents)}</td>
                <td className="num py-1.5 pr-3 text-right">{formatPlain(r.chargeCents)}</td>
                <td className="num py-1.5 text-right">{formatPlain(r.closingCents)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1.5 pr-3">Total</td>
              <td />
              <td className="num py-1.5 pr-3 text-right">{formatPlain(total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </TableScroll>
      {rows[0] && (
        <p className="mt-3 text-sm text-muted">
          Year 1 journal: Dr Depreciation {formatPlain(rows[0].chargeCents)} / Cr Accumulated Depreciation {formatPlain(rows[0].chargeCents)}.
        </p>
      )}
    </Card>
  );
}

export function DepreciationPage() {
  const [cost, setCost] = useState('10,000');
  const [residual, setResidual] = useState('1,000');
  const [life, setLife] = useState('5');
  const [rate, setRate] = useState('30');
  const lifeN = Number(life);
  const rateN = Number(rate);
  let sl: DepreciationYear[] = [];
  let rb: DepreciationYear[] = [];
  let error: string | null = null;
  try {
    sl = straightLine(cents(cost), cents(residual), lifeN);
    rb = reducingBalance(cents(cost), Math.round(rateN * 100), lifeN, cents(residual));
  } catch (e) {
    error = e instanceof Error ? e.message : 'Check the inputs';
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Depreciation"
        lead={
          <>
            Compare straight line with reducing balance for the same asset. Background in <TextLink to="/learn/core-accounting/accounting-policies-templates">Accounting policies</TextLink>.
          </>
        }
      />
      <Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyInput label="Cost" value={cost} onChange={setCost} />
          <MoneyInput label="Residual value" value={residual} onChange={setResidual} />
          <Field label="Useful life (years)">
            <input className={inputClass} type="number" min={1} max={50} value={life} onChange={(e) => setLife(e.target.value)} />
          </Field>
          <Field label="Reducing balance rate (%)">
            <input className={inputClass} type="number" min={1} max={100} step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        </div>
      </Card>
      {error ? (
        <Callout tone="bad">{error}</Callout>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Schedule title="Straight line" rows={sl} />
          <Schedule title={`Reducing balance at ${rateN}%`} rows={rb} />
        </div>
      )}
      <Callout>
        Reducing balance never reaches the residual value exactly on its own, so the schedule stops at the useful life. Straight line puts any rounding cent in the last
        year so the asset ends exactly at its residual value. Tax depreciation (AU) and capital allowances (UK) follow separate tax rules.
      </Callout>
    </div>
  );
}
