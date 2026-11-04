import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Field, PageHeader, TableScroll, inputClass } from '../../components/ui';
import { ApiError } from '../../lib/api';
import {
  getBillingSettings,
  listRates,
  saveBillingSettings,
  setRate,
  type BillingSettings as Settings,
  type RateCard,
} from '../../lib/billing';
import { formatMoney, parseMoney, type Currency } from '@chub/shared/utils/money';

interface Form {
  jurisdiction: '' | 'AU' | 'UK';
  legalName: string;
  address: string;
  taxRegistered: boolean;
  taxNumber: string;
  paymentDays: string;
  paymentDetails: string;
  accountCode: string;
}

function toForm(s: Settings): Form {
  return {
    jurisdiction: s.jurisdiction ?? '',
    legalName: s.legalName ?? '',
    address: s.address ?? '',
    taxRegistered: s.taxRegistered,
    taxNumber: s.taxNumber ?? '',
    paymentDays: String(s.paymentDays),
    paymentDetails: s.paymentDetails,
    accountCode: s.accountCode,
  };
}

function emptyToNull(value: string): string | null {
  return value.trim() === '' ? null : value;
}

export function BillingSettings() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [rates, setRates] = useState<RateCard[]>([]);
  const [members, setMembers] = useState<{ userId: string; name: string }[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [ratesLoadError, setRatesLoadError] = useState<string | null>(null);
  const [rateUser, setRateUser] = useState('');
  const [rateCurrency, setRateCurrency] = useState<Currency>('AUD');
  const [rateText, setRateText] = useState('');
  const [costText, setCostText] = useState('');
  const [rateError, setRateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBillingSettings()
      .then((view) => {
        if (cancelled) return;
        setForm(toForm(view.settings));
        setCanEdit(view.canEdit);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load billing');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listRates()
      .then((view) => {
        if (cancelled) return;
        setRates(view.rates);
        setMembers(view.members);
      })
      .catch((err: unknown) => {
        if (!cancelled) setRatesLoadError(err instanceof ApiError ? err.message : 'Could not load rates');
      })
      .finally(() => {
        if (!cancelled) setRatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => (prev === null ? prev : { ...prev, [key]: value }));
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (form === null) return;
    setSaving(true);
    setSaveNotice(null);
    setSaveError(null);
    try {
      const saved = await saveBillingSettings({
        ...(form.jurisdiction === '' ? {} : { jurisdiction: form.jurisdiction }),
        legalName: emptyToNull(form.legalName),
        address: emptyToNull(form.address),
        taxRegistered: form.taxRegistered,
        taxNumber: emptyToNull(form.taxNumber),
        paymentDays: Number(form.paymentDays),
        paymentDetails: form.paymentDetails,
        accountCode: form.accountCode,
      });
      setForm(toForm(saved));
      setSaveNotice('Billing details saved.');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save billing details');
    } finally {
      setSaving(false);
    }
  }

  async function onSaveRate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cents = parseMoney(rateText);
    if (cents === null || cents < 0) {
      setRateError('Enter an amount such as 150 or 150.50.');
      return;
    }
    const cost = costText.trim() === '' ? null : parseMoney(costText);
    if (costText.trim() !== '' && (cost === null || cost < 0)) {
      setRateError('Enter a cost such as 80 or 80.50, or leave it blank.');
      return;
    }
    setRateError(null);
    try {
      const next = await setRate({
        userId: rateUser === '' ? null : rateUser,
        currency: rateCurrency,
        centsPerHour: cents,
        costCentsPerHour: cost,
      });
      setRates(next);
      setRateText('');
      setCostText('');
    } catch (err) {
      setRateError(err instanceof ApiError ? err.message : 'Could not save the rate');
    }
  }

  async function onRemove(rate: RateCard) {
    setRateError(null);
    try {
      const next = await setRate({ userId: rate.userId, currency: rate.currency, centsPerHour: null });
      setRates(next);
    } catch (err) {
      setRateError(err instanceof ApiError ? err.message : 'Could not remove the rate');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" lead="Your firm's details on every invoice, and the hourly rates used for time." />

      <Card>
        <h2 className="font-semibold">Invoice details</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : loadError !== null ? (
          <p role="alert" className="mt-3 text-sm text-bad">
            {loadError}
          </p>
        ) : form === null ? null : (
          <form aria-label="Invoice details" onSubmit={onSave} className="mt-4 space-y-4">
            {!canEdit && <p className="text-sm text-muted">Only owners and admins can change billing.</p>}
            <Field label="Country">
              <select
                className={inputClass}
                value={form.jurisdiction}
                disabled={!canEdit}
                onChange={(e) => update('jurisdiction', e.target.value as Form['jurisdiction'])}
              >
                <option value="">Choose…</option>
                <option value="AU">Australia</option>
                <option value="UK">United Kingdom</option>
              </select>
            </Field>
            <Field label="Legal name">
              <input
                className={inputClass}
                value={form.legalName}
                disabled={!canEdit}
                onChange={(e) => update('legalName', e.target.value)}
              />
            </Field>
            <Field label="Address">
              <textarea
                rows={3}
                className={inputClass}
                value={form.address}
                disabled={!canEdit}
                onChange={(e) => update('address', e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-4"
                checked={form.taxRegistered}
                disabled={!canEdit}
                onChange={(e) => update('taxRegistered', e.target.checked)}
              />
              <span>Registered for GST or VAT</span>
            </label>
            <Field label="ABN or VAT number">
              <input
                className={inputClass}
                value={form.taxNumber}
                disabled={!canEdit}
                onChange={(e) => update('taxNumber', e.target.value)}
              />
            </Field>
            <Field label="Payment terms (days)">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                step={1}
                className={inputClass}
                value={form.paymentDays}
                disabled={!canEdit}
                onChange={(e) => update('paymentDays', e.target.value)}
              />
            </Field>
            <Field label="Payment details" hint="Bank details or how to pay. Shown on every invoice.">
              <textarea
                rows={3}
                className={inputClass}
                value={form.paymentDetails}
                disabled={!canEdit}
                onChange={(e) => update('paymentDetails', e.target.value)}
              />
            </Field>
            <Field label="Xero sales account code" hint="Used in the CSV export. 200 is Sales in Xero's demo companies.">
              <input
                className={inputClass}
                value={form.accountCode}
                disabled={!canEdit}
                onChange={(e) => update('accountCode', e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!canEdit || saving}>
                Save billing details
              </Button>
              {saveNotice !== null && (
                <p role="status" className="text-sm text-good">
                  {saveNotice}
                </p>
              )}
              {saveError !== null && (
                <p role="alert" className="text-sm text-bad">
                  {saveError}
                </p>
              )}
            </div>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Hourly rates</h2>
        <p className="mt-1 text-sm text-muted">The cost per hour is only used for profitability, and only owners and admins see it.</p>
        {ratesLoading ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : ratesLoadError !== null ? (
          <p role="alert" className="mt-3 text-sm text-bad">
            {ratesLoadError}
          </p>
        ) : rates.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No rates yet.</p>
        ) : (
          <TableScroll>
            <table className="mt-4 w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Who
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Currency
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Rate per hour
                  </th>
                  {canEdit && (
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Cost per hour
                    </th>
                  )}
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={`${r.userId ?? 'default'}-${r.currency}`} className="border-b border-line">
                    <td className="py-2 pr-4">{r.userName}</td>
                    <td className="py-2 pr-4">{r.currency}</td>
                    <td className="num py-2 pr-4">{formatMoney(r.centsPerHour, r.currency)}</td>
                    {canEdit && (
                      <td className="num py-2 pr-4">{r.costCentsPerHour === null ? '—' : formatMoney(r.costCentsPerHour, r.currency)}</td>
                    )}
                    <td className="py-2 pr-4">
                      {canEdit && (
                        <Button variant="secondary" aria-label={`Remove rate for ${r.userName} in ${r.currency}`} onClick={() => void onRemove(r)}>
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}

        {canEdit && (
          <form aria-label="Set an hourly rate" onSubmit={onSaveRate} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Who">
              <select className={inputClass} value={rateUser} onChange={(e) => setRateUser(e.target.value)}>
                <option value="">Firm default</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency">
              <select className={inputClass} value={rateCurrency} onChange={(e) => setRateCurrency(e.target.value as Currency)}>
                <option value="AUD">AUD</option>
                <option value="GBP">GBP</option>
              </select>
            </Field>
            <Field label="Rate per hour">
              <input
                type="text"
                inputMode="decimal"
                className={inputClass}
                value={rateText}
                onChange={(e) => setRateText(e.target.value)}
              />
            </Field>
            <Field label="Cost per hour (optional)">
              <input
                type="text"
                inputMode="decimal"
                className={inputClass}
                value={costText}
                onChange={(e) => setCostText(e.target.value)}
              />
            </Field>
            {rateError !== null && (
              <p role="alert" className="text-sm text-bad sm:col-span-2 lg:col-span-4">
                {rateError}
              </p>
            )}
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">Save rate</Button>
            </div>
          </form>
        )}
        {!canEdit && rateError !== null && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {rateError}
          </p>
        )}
      </Card>
    </div>
  );
}
