import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Field, inputClass } from './ui';
import { ApiError } from '../lib/api';
import { getPricing, savePricing, type Pricing } from '../lib/billing';
import { formatPlain, parseMoney, type Currency } from '@chub/shared/utils/money';
import type { PricingModel } from '@chub/shared/utils/invoice';

function amountText(cents: number | null): string {
  return cents === null ? '' : formatPlain(cents);
}

/** How an entity is billed. The server decides every amount; this card collects the model, currency and fee. */
export function PricingCard({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [model, setModel] = useState<PricingModel>('hourly');
  const [currency, setCurrency] = useState<Currency>('AUD');
  const [fixedText, setFixedText] = useState('');
  const [retainerText, setRetainerText] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getPricing(clientId)
      .then((view) => {
        if (cancelled) return;
        applyPricing(view.pricing);
        setCanEdit(view.canEdit);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load pricing');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  function applyPricing(p: Pricing | null) {
    setModel(p?.model ?? 'hourly');
    setCurrency(p?.currency ?? 'AUD');
    setFixedText(amountText(p?.fixedCents ?? null));
    setRetainerText(amountText(p?.retainerCents ?? null));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice(null);
    setError(null);
    const fixedCents = model === 'fixed' ? parseMoney(fixedText) : null;
    const retainerCents = model === 'retainer' ? parseMoney(retainerText) : null;
    const fixedBad = model === 'fixed' && (fixedCents === null || fixedCents < 0);
    const retainerBad = model === 'retainer' && (retainerCents === null || retainerCents < 0);
    if (fixedBad || retainerBad) {
      setError('Enter an amount such as 1100 or 1100.50.');
      return;
    }
    setSaving(true);
    try {
      const saved = await savePricing(clientId, {
        model,
        currency,
        fixedCents: model === 'fixed' ? fixedCents : null,
        retainerCents: model === 'retainer' ? retainerCents : null,
      });
      applyPricing(saved);
      setNotice('Pricing saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save pricing');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">Pricing</h2>
      <p className="mt-1 text-sm text-muted">How this entity is billed. Hourly uses the rates on the Billing page.</p>
      {loading ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : loadError !== null ? (
        <p role="alert" className="mt-4 text-sm text-bad">
          {loadError}
        </p>
      ) : (
        <form aria-label="Pricing" onSubmit={onSubmit} className="mt-4 space-y-4">
          {!canEdit && <p className="text-sm text-muted">Only owners and admins can change pricing.</p>}
          <Field label="Pricing model">
            <select
              className={inputClass}
              value={model}
              disabled={!canEdit}
              onChange={(e) => setModel(e.target.value as PricingModel)}
            >
              <option value="hourly">Hourly</option>
              <option value="fixed">Fixed fee per engagement</option>
              <option value="retainer">Monthly retainer</option>
            </select>
          </Field>
          <Field label="Currency">
            <select
              className={inputClass}
              value={currency}
              disabled={!canEdit}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              <option value="AUD">AUD</option>
              <option value="GBP">GBP</option>
            </select>
          </Field>
          {model === 'fixed' && (
            <Field label="Fixed fee">
              <input
                type="text"
                inputMode="decimal"
                className={inputClass}
                value={fixedText}
                disabled={!canEdit}
                onChange={(e) => setFixedText(e.target.value)}
              />
            </Field>
          )}
          {model === 'retainer' && (
            <Field label="Monthly retainer">
              <input
                type="text"
                inputMode="decimal"
                className={inputClass}
                value={retainerText}
                disabled={!canEdit}
                onChange={(e) => setRetainerText(e.target.value)}
              />
            </Field>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canEdit || saving}>
              Save pricing
            </Button>
            {notice !== null && (
              <p role="status" className="text-sm text-good">
                {notice}
              </p>
            )}
            {error !== null && (
              <p role="alert" className="text-sm text-bad">
                {error}
              </p>
            )}
          </div>
        </form>
      )}
    </Card>
  );
}
