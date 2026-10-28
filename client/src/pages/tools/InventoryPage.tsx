import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Callout, Card, cx, inputClass, PageHeader, TableScroll, TextLink } from '../../components/ui';
import { fifo, InsufficientStockError, weightedAverage, type StockEvent, type StockResult } from '../../utils/inventory';
import { formatPlain, parseMoney } from '@chub/shared/utils/money';

interface Row {
  key: number;
  kind: 'purchase' | 'sale';
  qty: string;
  cost: string;
}
let key = 100;
const sample: Row[] = [
  { key: 1, kind: 'purchase', qty: '100', cost: '10.00' },
  { key: 2, kind: 'purchase', qty: '100', cost: '12.00' },
  { key: 3, kind: 'sale', qty: '150', cost: '' },
  { key: 4, kind: 'purchase', qty: '50', cost: '13.00' },
  { key: 5, kind: 'sale', qty: '60', cost: '' },
];

function run(fn: (e: StockEvent[]) => StockResult, events: StockEvent[]): { result?: StockResult; error?: string } {
  try {
    return { result: fn(events) };
  } catch (e) {
    if (e instanceof InsufficientStockError || e instanceof RangeError) return { error: e.message };
    throw e;
  }
}

function Steps({ title, out }: { title: string; out: { result?: StockResult; error?: string } }) {
  return (
    <Card>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {out.error && <Callout tone="bad">{out.error}</Callout>}
      {out.result && (
        <>
          <TableScroll>
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-1.5 pr-3 font-medium">#</th>
                  <th className="py-1.5 pr-3 font-medium">What happened</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Cost of sale</th>
                  <th className="py-1.5 pr-3 text-right font-medium">On hand</th>
                  <th className="py-1.5 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {out.result.steps.map((s) => (
                  <tr key={s.index} className="border-b border-line align-top">
                    <td className="py-1.5 pr-3">{s.index + 1}</td>
                    <td className="py-1.5 pr-3">{s.detail}</td>
                    <td className="num py-1.5 pr-3 text-right">{s.costOfSaleCents ? formatPlain(s.costOfSaleCents) : ''}</td>
                    <td className="num py-1.5 pr-3 text-right">{s.qtyOnHand}</td>
                    <td className="num py-1.5 text-right">{formatPlain(s.valueOnHandCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-panel-2 p-3">
              <dt className="text-muted">Cost of goods sold</dt>
              <dd className="num text-lg font-semibold">{formatPlain(out.result.cogsCents)}</dd>
            </div>
            <div className="rounded-lg bg-panel-2 p-3">
              <dt className="text-muted">Closing stock ({out.result.closingQty} units)</dt>
              <dd className="num text-lg font-semibold">{formatPlain(out.result.closingValueCents)}</dd>
            </div>
          </dl>
        </>
      )}
    </Card>
  );
}

export function InventoryPage() {
  const [rows, setRows] = useState<Row[]>(sample);
  const set = (k: number, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const events: StockEvent[] = rows.map((r) =>
    r.kind === 'purchase' ? { kind: 'purchase', qty: Number(r.qty), unitCostCents: parseMoney(r.cost) ?? 0 } : { kind: 'sale', qty: Number(r.qty) },
  );
  const f = run(fifo, events);
  const w = run(weightedAverage, events);
  const diff = f.result && w.result ? f.result.cogsCents - w.result.cogsCents : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory: FIFO vs weighted average"
        lead={
          <>
            The same purchases and sales, costed both ways. LIFO is not allowed under IFRS, FRS 102, FRS 105 or AASB, so it is not offered. Background in{' '}
            <TextLink to="/knowledge/learn/core-accounting/accounting-policies-templates">Accounting policies</TextLink>.
          </>
        }
      />
      <Card>
        <h2 className="mb-3 font-semibold">Movements, in date order</h2>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-[2rem_minmax(0,1fr)_5rem] gap-2 sm:grid-cols-[2rem_9rem_6rem_8rem_auto] sm:items-center">
              <span className="num pt-2 text-sm text-muted sm:pt-0">{i + 1}</span>
              <select aria-label={`Movement ${i + 1} type`} className={inputClass} value={r.kind} onChange={(e) => set(r.key, { kind: e.target.value as Row['kind'] })}>
                <option value="purchase">Purchase</option>
                <option value="sale">Sale</option>
              </select>
              <input aria-label={`Movement ${i + 1} quantity`} className={cx(inputClass, 'num text-right')} inputMode="numeric" value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} />
              <input
                aria-label={`Movement ${i + 1} unit cost`}
                className={cx(inputClass, 'num col-span-2 col-start-2 text-right sm:col-span-1 sm:col-start-auto', r.kind === 'sale' && 'invisible')}
                inputMode="decimal"
                placeholder="Unit cost"
                value={r.cost}
                onChange={(e) => set(r.key, { cost: e.target.value })}
              />
              <button type="button" aria-label={`Remove movement ${i + 1}`} onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-panel-2">
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setRows([...rows, { key: key++, kind: 'purchase', qty: '10', cost: '10.00' }])}>
            <Plus size={16} aria-hidden /> Add movement
          </Button>
          <Button variant="ghost" onClick={() => setRows(sample)}>
            Reset sample
          </Button>
        </div>
      </Card>
      {diff !== null && (
        <Callout tone="info">
          FIFO cost of sales is {diff === 0 ? 'the same as' : `${formatPlain(Math.abs(diff))} ${diff < 0 ? 'lower' : 'higher'} than`} weighted average
          {diff < 0 ? ', so FIFO shows a higher profit and a higher closing stock. That is what happens when prices are rising.' : '.'}
        </Callout>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Steps title="FIFO" out={f} />
        <Steps title="Weighted average (perpetual)" out={w} />
      </div>
    </div>
  );
}
