import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Field, PageHeader, Tabs, TableScroll, TextLink, inputClass } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { listClientEngagements, type EngagementView } from '../../lib/engagements';
import { createDraft, listInvoices, type InvoiceSummary } from '../../lib/invoices';
import { listEntityOptions, localToday } from '../../lib/time';
import { formatDay } from '@chub/shared/utils/deadlines';
import { formatMoney } from '@chub/shared/utils/money';
import { previousMonth, type InvoiceStatus } from '@chub/shared/utils/invoice';

type StatusTab = 'all' | InvoiceStatus;

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'issued', label: 'Issued' },
  { id: 'void', label: 'Void' },
];

const STATUS_LABEL: Record<InvoiceStatus, string> = { draft: 'Draft', issued: 'Issued', void: 'Void' };

export function InvoicesList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<StatusTab>('all');
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entities, setEntities] = useState<{ id: string; name: string }[]>([]);
  const [clientId, setClientId] = useState('');
  const [engagements, setEngagements] = useState<EngagementView[]>([]);
  const [period] = useState(() => previousMonth(localToday()));
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [engagementId, setEngagementId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listInvoices(tab === 'all' ? {} : { status: tab })
      .then((rows) => {
        if (!cancelled) setInvoices(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load invoices');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    listEntityOptions()
      .then((rows) => {
        if (cancelled) return;
        setEntities(rows);
        setClientId((prev) => (prev === '' ? (rows[0]?.id ?? '') : prev));
      })
      .catch((err: unknown) => {
        if (!cancelled) setCreateError(err instanceof ApiError ? err.message : 'Could not load entities');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (clientId === '') {
      setEngagements([]);
      return;
    }
    let cancelled = false;
    setEngagementId('');
    listClientEngagements(clientId)
      .then((view) => {
        if (!cancelled) setEngagements(view.engagements);
      })
      .catch((err: unknown) => {
        if (!cancelled) setCreateError(err instanceof ApiError ? err.message : 'Could not load engagements');
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const invoice = await createDraft({ clientId, from, to, engagementId: engagementId === '' ? null : engagementId });
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Could not create the draft');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" lead="Draft invoices from unbilled time and fees, then issue them with a number.">
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <TextLink to="/workspace/billing">Billing settings</TextLink>
          <TextLink to="/profitability">Profitability</TextLink>
        </div>
      </PageHeader>

      <Card>
        <h2 className="font-semibold">New draft invoice</h2>
        <form aria-label="New draft invoice" onSubmit={(e) => void onCreate(e)} className="mt-4 space-y-4">
          <Field label="Entity">
            <select className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {entities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="From">
              <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Field label="Engagement (needed for a fixed fee)">
            <select className={inputClass} value={engagementId} onChange={(e) => setEngagementId(e.target.value)}>
              <option value="">None</option>
              {engagements.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </Field>
          {createError !== null && (
            <p role="alert" className="text-sm text-bad">
              {createError}
            </p>
          )}
          <Button type="submit" disabled={creating}>
            Create draft
          </Button>
        </form>
      </Card>

      <Card>
        <Tabs tabs={STATUS_TABS} value={tab} onChange={setTab} label="Invoice status" />
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error !== null ? (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted">No invoices yet.</p>
        ) : (
          <TableScroll>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Number
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Entity
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Issued
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Due
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-line">
                    <td className="py-2 pr-4">
                      <TextLink to={`/invoices/${inv.id}`}>{inv.displayNumber ?? 'Draft'}</TextLink>
                    </td>
                    <td className="py-2 pr-4">{inv.clientName}</td>
                    <td className="py-2 pr-4">{STATUS_LABEL[inv.status]}</td>
                    <td className="py-2 pr-4">{inv.issuedOn !== null ? formatDay(inv.issuedOn) : '—'}</td>
                    <td className="py-2 pr-4">{inv.dueOn !== null ? formatDay(inv.dueOn) : '—'}</td>
                    <td className="num py-2">{formatMoney(inv.totalCents, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </div>
  );
}
