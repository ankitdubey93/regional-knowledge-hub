import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Callout, Card, Field, PageHeader, TableScroll, TextLink, inputClass } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { getProfitability, type ProfitReport } from '../../lib/profitability';
import { localToday } from '../../lib/time';
import { addDays } from '@chub/shared/utils/deadlines';
import { formatMoney, formatRate, type Currency } from '@chub/shared/utils/money';
import { formatMinutes } from '@chub/shared/utils/workload';
import { sortEntities, type ProfitSort } from '@chub/shared/utils/profitability';

interface Query {
  from: string;
  to: string;
  currency: '' | Currency;
}

function currencyParam(value: string | null): '' | Currency {
  return value === 'GBP' ? 'GBP' : value === 'AUD' ? 'AUD' : '';
}

export function Profitability() {
  const [params] = useSearchParams();
  const [initial] = useState<Query>(() => ({
    from: params.get('from') ?? addDays(localToday(), -364),
    to: params.get('to') ?? localToday(),
    currency: currencyParam(params.get('currency')),
  }));
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [currency, setCurrency] = useState<'' | Currency>(initial.currency);
  const [sort, setSort] = useState<ProfitSort>('margin-asc');
  const [query, setQuery] = useState<Query>(initial);
  const [report, setReport] = useState<ProfitReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getProfitability({ from: query.from, to: query.to, ...(query.currency === '' ? {} : { currency: query.currency }) })
      .then((next) => {
        if (cancelled) return;
        setReport(next);
        if (query.currency === '') setCurrency(next.currency);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load profitability');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setQuery({ from, to, currency });
  }

  const shownCurrency: Currency = report?.currency ?? (currency === '' ? 'AUD' : currency);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profitability"
        lead="Time cost against what was billed, per entity and engagement, for invoices issued in the period."
      />
      <Callout label="What this counts">
        Invoices issued in the period, before tax. Time is the time on those invoices, costed at today&apos;s rates. Unbilled time,
        non-billable time, drafts and void invoices are left out. Each currency is shown on its own and never converted.
      </Callout>

      <Card>
        <form aria-label="Profitability filter" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From">
            <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Currency">
            <select className={inputClass} value={currency === '' ? 'AUD' : currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="AUD">AUD</option>
              <option value="GBP">GBP</option>
            </select>
          </Field>
          <div className="flex items-end">
            <Button type="submit">Show</Button>
          </div>
        </form>
        <div className="mt-4">
          <Field label="Sort by">
            <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value as ProfitSort)}>
              <option value="margin-asc">Lowest margin first</option>
              <option value="margin-desc">Highest margin first</option>
              <option value="name">Entity name</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error !== null ? (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        ) : report === null ? null : report.entities.length === 0 ? (
          <p className="text-sm text-muted">No issued invoices in this period.</p>
        ) : (
          <>
            <TableScroll>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Entity
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Invoices
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Billed
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Time
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Time cost
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Standard value
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Realisation
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Margin
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortEntities(report.entities, sort).map((row) => (
                    <FragmentRows key={row.clientId} row={row} currency={shownCurrency} />
                  ))}
                </tbody>
              </table>
            </TableScroll>
            {report.entities.some((row) => row.missingCostMinutes > 0) && (
              <p className="mt-3 text-sm text-muted">
                Some time has no cost rate, so its time cost and margin show n/a. Set cost rates on the{' '}
                <TextLink to="/workspace/billing">Billing page</TextLink>.
              </p>
            )}
            {report.entities.some((row) => row.missingRateMinutes > 0) && (
              <p className="mt-3 text-sm text-muted">
                Some time has no hourly rate in {report.currency}, so its standard value and realisation show n/a.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function cents(value: number | null, currency: Currency): string {
  return value === null ? 'n/a' : formatMoney(value, currency);
}

function rate(bp: number | null): string {
  return bp === null ? 'n/a' : formatRate(bp);
}

type Totals = {
  billedCents: number;
  minutes: number;
  costCents: number | null;
  standardCents: number | null;
  realisationBp: number | null;
  marginBp: number | null;
};

function FiguresCells({ row, currency }: { row: Totals; currency: Currency }) {
  return (
    <>
      <td className="num py-2 pr-4">{formatMoney(row.billedCents, currency)}</td>
      <td className="num py-2 pr-4">{formatMinutes(row.minutes)}</td>
      <td className="num py-2 pr-4">{cents(row.costCents, currency)}</td>
      <td className="num py-2 pr-4">{cents(row.standardCents, currency)}</td>
      <td className="num py-2 pr-4">{rate(row.realisationBp)}</td>
      <td className={`num py-2 pr-4${row.marginBp !== null && row.marginBp < 0 ? ' text-bad' : ''}`}>{rate(row.marginBp)}</td>
    </>
  );
}

function FragmentRows({
  row,
  currency,
}: {
  row: Totals & {
    clientId: string;
    clientName: string;
    invoiceCount: number;
    engagements: (Totals & { engagementId: string; title: string })[];
  };
  currency: Currency;
}) {
  return (
    <>
      <tr className="border-b border-line">
        <th scope="row" className="py-2 pr-4 font-semibold">
          {row.clientName}
        </th>
        <td className="num py-2 pr-4">{row.invoiceCount}</td>
        <FiguresCells row={row} currency={currency} />
      </tr>
      {row.engagements.map((g) => (
        <tr key={g.engagementId} className="border-b border-line">
          <th scope="row" className="py-2 pr-4 pl-6 font-normal">
            <span className="sr-only">Engagement: </span>
            {g.title}
          </th>
          <td className="py-2 pr-4" />
          <FiguresCells row={g} currency={currency} />
        </tr>
      ))}
    </>
  );
}
