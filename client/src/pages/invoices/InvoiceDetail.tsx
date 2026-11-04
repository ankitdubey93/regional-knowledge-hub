import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Callout, Card, Field, PageHeader, TableScroll, TextLink, inputClass } from '../../components/ui';
import { ApiError } from '../../lib/api';
import {
  addLine,
  deleteInvoice,
  deleteLine,
  getInvoice,
  invoiceCsvUrl,
  issueInvoice,
  patchInvoice,
  patchLine,
  voidInvoice,
  type InvoiceView,
} from '../../lib/invoices';
import { localToday } from '../../lib/time';
import { formatDay } from '@chub/shared/utils/deadlines';
import { formatMoney, formatRate, parseMoney } from '@chub/shared/utils/money';
import { formatMinutes } from '@chub/shared/utils/workload';
import {
  INVOICE_CONTENT_CHECKED_ON,
  documentTitle,
  formatFxRate,
  parseFxMicros,
  taxLabel,
  treatmentLabel,
  type TaxScheme,
  type TaxTreatment,
} from '@chub/shared/utils/invoice';
import { XERO_CSV_CHECKED_ON } from '@chub/shared/utils/invoiceCsv';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; invoice: InvoiceView };

type Fx = { rateMicros: number; date: string; source: string };
type FxRead = { ok: true; patch: { fx?: Fx | null } } | { ok: false; message: string };

/** The exchange-rate block shows when the invoice is in another currency than the firm's home currency. */
function fxShownFor(inv: InvoiceView): boolean {
  return inv.homeCurrency !== null && inv.currency !== inv.homeCurrency;
}

/** All three fields empty means no rate; all three filled means a rate; anything else is refused. */
function readFx(inv: InvoiceView, rate: string, date: string, source: string): FxRead {
  if (!fxShownFor(inv)) return { ok: true, patch: {} };
  const rateText = rate.trim();
  const dateText = date.trim();
  const sourceText = source.trim();
  const micros = rateText === '' ? null : parseFxMicros(rateText);
  if (rateText !== '' && micros === null) {
    return { ok: false, message: 'Enter a rate such as 1.95 (up to 6 decimal places).' };
  }
  const filled = [rateText, dateText, sourceText].filter((s) => s !== '').length;
  if (filled === 0) return { ok: true, patch: { fx: null } };
  if (filled < 3 || micros === null) {
    return { ok: false, message: 'Enter the rate, its date and its source, or leave all three empty.' };
  }
  return { ok: true, patch: { fx: { rateMicros: micros, date: dateText, source: sourceText } } };
}

/** The required content of a tax invoice follows the constant in shared, never a hard-coded flag (Hard rule 2). */
function contentWarning(scheme: TaxScheme): string | null {
  if (scheme === 'none' || INVOICE_CONTENT_CHECKED_ON[scheme] !== null) return null;
  return scheme === 'au_gst'
    ? "The required content of an Australian tax invoice has not been checked against the ATO's guidance. Check this invoice before you send it."
    : "The required content of a UK VAT invoice has not been checked against HMRC's guidance. Check this invoice before you send it.";
}

export function InvoiceDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Draft details (filled from the invoice on load; not overwritten by later actions, so unsaved text survives).
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerTaxNumber, setBuyerTaxNumber] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [fxRate, setFxRate] = useState('');
  const [fxDate, setFxDate] = useState('');
  const [fxSource, setFxSource] = useState('');

  // Draft: add a line.
  const [lineText, setLineText] = useState('');
  const [lineAmount, setLineAmount] = useState('');
  const [lineTreatment, setLineTreatment] = useState<TaxTreatment>('standard');

  const [issuedOn, setIssuedOn] = useState(() => localToday());
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setActionError(null);
    setNotice(null);
    getInvoice(id)
      .then((invoice) => {
        if (cancelled) return;
        setState({ status: 'ready', invoice });
        setBuyerAddress(invoice.buyerAddress);
        setBuyerTaxNumber(invoice.buyerTaxNumber);
        setReference(invoice.reference);
        setNotes(invoice.notes);
        setFxRate(invoice.fxRateMicros === null ? '' : formatFxRate(invoice.fxRateMicros));
        setFxDate(invoice.fxRateDate ?? '');
        setFxSource(invoice.fxRateSource ?? '');
        setLineTreatment(invoice.allowedTreatments.includes('standard') ? 'standard' : 'outside');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'missing' });
        } else {
          setState({ status: 'error', message: err instanceof ApiError ? err.message : 'Could not load the invoice' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  /** Sends one action, replaces the invoice with the response, and reports the outcome. Returns true on success. */
  async function runAction(fn: (inv: InvoiceView) => Promise<InvoiceView>, fallback: string, successNotice?: string): Promise<boolean> {
    if (state.status !== 'ready') return false;
    const inv = state.invoice;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const updated = await fn(inv);
      setState({ status: 'ready', invoice: updated });
      if (successNotice !== undefined) setNotice(successNotice);
      return true;
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.status !== 'ready') return;
    const read = readFx(state.invoice, fxRate, fxDate, fxSource);
    if (!read.ok) {
      setActionError(read.message);
      setNotice(null);
      return;
    }
    await runAction(
      (inv) => patchInvoice(inv.id, { buyerAddress, buyerTaxNumber, reference, notes, ...read.patch }),
      'Could not save the details',
      'Details saved.',
    );
  }

  async function onAddLine(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.status !== 'ready') return;
    const amountCents = parseMoney(lineAmount);
    if (amountCents === null || amountCents < 0) {
      setActionError('Enter an amount such as 67 or 67.50.');
      return;
    }
    const description = lineText.trim();
    const ok = await runAction(
      (inv) => addLine(inv.id, { description, amountCents, taxTreatment: lineTreatment }),
      'Could not add the line',
    );
    if (ok) {
      setLineText('');
      setLineAmount('');
    }
  }

  async function onChangeTreatment(lineId: string, taxTreatment: TaxTreatment) {
    await runAction((inv) => patchLine(inv.id, lineId, { taxTreatment }), 'Could not change the tax treatment');
  }

  async function onRemoveLine(lineId: string) {
    await runAction((inv) => deleteLine(inv.id, lineId), 'Could not remove the line');
  }

  async function onIssue() {
    await runAction((inv) => issueInvoice(inv.id, issuedOn), 'Could not issue the invoice');
  }

  async function onVoid() {
    const reason = voidReason.trim();
    if (reason === '') {
      setActionError('Give a reason for voiding.');
      return;
    }
    await runAction((inv) => voidInvoice(inv.id, reason), 'Could not void the invoice');
  }

  async function onDeleteDraft() {
    if (state.status !== 'ready') return;
    if (!window.confirm('Delete this draft? Its time becomes unbilled again.')) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteInvoice(state.invoice.id);
      navigate('/invoices');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not delete the draft');
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') return <p className="text-muted">Loading…</p>;
  if (state.status === 'missing') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Invoice not found</h1>
        <TextLink to="/invoices">Back to invoices</TextLink>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-bad">
        {state.message}
      </p>
    );
  }

  const inv = state.invoice;
  const label = taxLabel(inv.taxScheme);
  const isDraft = inv.status === 'draft';
  const title =
    inv.status === 'draft'
      ? 'Draft invoice'
      : inv.status === 'issued'
        ? `${documentTitle(inv.taxScheme)} ${inv.displayNumber ?? ''}`
        : `Void: ${inv.displayNumber ?? ''}`;

  const outsideCountry =
    inv.taxScheme !== 'none' &&
    inv.seller.jurisdiction !== null &&
    inv.clientJurisdiction !== inv.seller.jurisdiction &&
    inv.clientJurisdiction !== 'AU+UK';
  const contentMessage = contentWarning(inv.taxScheme);
  const rateUnchecked = inv.taxScheme !== 'none' && inv.rateFactVerifiedOn === null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={inv.clientName} title={title} />

      {(outsideCountry || contentMessage !== null || rateUnchecked) && (
        <div className="space-y-3">
          {outsideCountry && (
            <Callout tone="warn" label="Check the tax treatment">
              This entity is outside your country. Whether this supply is taxable (for example GST-free, or outside the scope of UK VAT) is your decision; the app does not decide it.
            </Callout>
          )}
          {contentMessage !== null && (
            <Callout tone="warn" label="Not checked">
              {contentMessage}
            </Callout>
          )}
          {rateUnchecked && (
            <Callout tone="warn" label="Not checked">
              The tax rate on this invoice has not been checked against its official source.
            </Callout>
          )}
        </div>
      )}

      {actionError !== null && (
        <p role="alert" className="text-sm text-bad">
          {actionError}
        </p>
      )}
      {notice !== null && (
        <p role="status" className="text-sm text-good">
          {notice}
        </p>
      )}

      {isDraft && (
        <Card>
          <h2 className="font-semibold">Details</h2>
          <form aria-label="Invoice details" onSubmit={(e) => void onSaveDetails(e)} className="mt-4 space-y-4">
            <Field label="Customer address">
              <textarea rows={3} className={inputClass} value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} />
            </Field>
            <Field label="Customer ABN or VAT number">
              <input className={inputClass} value={buyerTaxNumber} onChange={(e) => setBuyerTaxNumber(e.target.value)} />
            </Field>
            <Field label="Reference">
              <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Notes">
              <textarea rows={3} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {fxShownFor(inv) && (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={`Rate (${inv.homeCurrency} per 1 ${inv.currency})`}>
                  <input type="text" inputMode="decimal" className={inputClass} value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
                </Field>
                <Field label="Rate date">
                  <input type="date" className={inputClass} value={fxDate} onChange={(e) => setFxDate(e.target.value)} />
                </Field>
                <Field label="Rate source">
                  <input type="text" className={inputClass} value={fxSource} onChange={(e) => setFxSource(e.target.value)} />
                </Field>
              </div>
            )}
            <Button type="submit" disabled={busy}>
              Save details
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">Lines</h2>
        <TableScroll>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Description
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Quantity
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Unit price
                </th>
                {inv.taxScheme !== 'none' && (
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {label}
                  </th>
                )}
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Amount
                </th>
                {isDraft && (
                  <th scope="col" className="py-2 font-semibold">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((line) => (
                <tr key={line.id} className="border-b border-line align-top">
                  <td className="py-2 pr-3">{line.description}</td>
                  <td className="num py-2 pr-3">{line.kind === 'time' && line.minutes !== null ? formatMinutes(line.minutes) : '1'}</td>
                  <td className="num py-2 pr-3">
                    {line.kind === 'time' ? `${formatMoney(line.unitCents, inv.currency)}/hour` : formatMoney(line.unitCents, inv.currency)}
                  </td>
                  {inv.taxScheme !== 'none' && (
                    <td className="py-2 pr-3">
                      {line.taxTreatment === 'standard' ? formatRate(inv.taxRateBp) : treatmentLabel(inv.taxScheme, line.taxTreatment)}
                    </td>
                  )}
                  <td className="num py-2 pr-3">{formatMoney(line.amountCents, inv.currency)}</td>
                  {isDraft && (
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Tax treatment for ${line.description}`}
                          className={inputClass}
                          value={line.taxTreatment}
                          disabled={busy}
                          onChange={(e) => void onChangeTreatment(line.id, e.target.value as TaxTreatment)}
                        >
                          {inv.allowedTreatments.map((t) => (
                            <option key={t} value={t}>
                              {treatmentLabel(inv.taxScheme, t)}
                            </option>
                          ))}
                        </select>
                        <Button variant="secondary" aria-label={`Remove ${line.description}`} disabled={busy} onClick={() => void onRemoveLine(line.id)}>
                          Remove
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {isDraft && (
        <Card>
          <h2 className="font-semibold">Add a line</h2>
          <form aria-label="Add a line" onSubmit={(e) => void onAddLine(e)} className="mt-4 space-y-4">
            <Field label="Description">
              <input className={inputClass} value={lineText} onChange={(e) => setLineText(e.target.value)} />
            </Field>
            <Field label="Amount">
              <input type="text" inputMode="decimal" className={inputClass} value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} />
            </Field>
            <Field label="Tax treatment">
              <select className={inputClass} value={lineTreatment} onChange={(e) => setLineTreatment(e.target.value as TaxTreatment)}>
                {inv.allowedTreatments.map((t) => (
                  <option key={t} value={t}>
                    {treatmentLabel(inv.taxScheme, t)}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit" disabled={busy}>
              Add line
            </Button>
          </form>
        </Card>
      )}

      <div className="space-y-4">
        <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
          <dt>{inv.taxScheme === 'none' || label === null ? 'Subtotal' : `Subtotal (excluding ${label})`}</dt>
          <dd className="num">{formatMoney(inv.subtotalCents, inv.currency)}</dd>
          {inv.taxScheme !== 'none' && label !== null && inv.noTaxSubtotalCents > 0 && (
            <>
              <dt>{`Total with no ${label}`}</dt>
              <dd className="num">{formatMoney(inv.noTaxSubtotalCents, inv.currency)}</dd>
            </>
          )}
          {inv.taxScheme !== 'none' && label !== null && (
            <>
              <dt>{`${label} at ${formatRate(inv.taxRateBp)}`}</dt>
              <dd className="num">{formatMoney(inv.taxCents, inv.currency)}</dd>
            </>
          )}
          <dt className="font-semibold">Total</dt>
          <dd className="num font-semibold">{formatMoney(inv.totalCents, inv.currency)}</dd>
        </dl>
        {inv.fxRateMicros !== null && inv.homeCurrency !== null && inv.fxRateDate !== null && inv.fxRateSource !== null && (
          <div className="ml-auto max-w-sm space-y-2 text-sm">
            <p>{`Exchange rate: 1 ${inv.currency} = ${formatFxRate(inv.fxRateMicros)} ${inv.homeCurrency} (${formatDay(inv.fxRateDate)}, ${inv.fxRateSource})`}</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
              {inv.taxHomeCents !== null && label !== null && (
                <>
                  <dt>{`${label} in ${inv.homeCurrency}`}</dt>
                  <dd className="num">{formatMoney(inv.taxHomeCents, inv.homeCurrency)}</dd>
                </>
              )}
              {inv.totalHomeCents !== null && (
                <>
                  <dt>{`Total in ${inv.homeCurrency}`}</dt>
                  <dd className="num">{formatMoney(inv.totalHomeCents, inv.homeCurrency)}</dd>
                </>
              )}
            </dl>
          </div>
        )}
      </div>

      {isDraft && (
        <div className="flex flex-wrap items-end gap-4">
          {inv.canIssue ? (
            <>
              <Field label="Issue date">
                <input type="date" className={inputClass} value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
              </Field>
              <Button disabled={busy} onClick={() => void onIssue()}>
                Issue invoice
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted">An owner or admin issues invoices.</p>
          )}
          <TextLink to={`/invoices/${inv.id}/print`}>Preview print</TextLink>
          <Button variant="secondary" disabled={busy} onClick={() => void onDeleteDraft()}>
            Delete draft
          </Button>
        </div>
      )}

      {inv.status === 'issued' && (
        <Card>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <TextLink to={`/invoices/${inv.id}/print`}>Print or save as PDF</TextLink>
            <a
              href={invoiceCsvUrl(inv.id)}
              download
              className="font-semibold text-accent underline decoration-1 underline-offset-[3px] hover:text-accent-hover"
            >
              Download CSV for Xero
            </a>
          </div>
          {XERO_CSV_CHECKED_ON === null && (
            <p className="mt-3 text-sm text-muted">Not checked against a Xero import yet. Choose tax-exclusive amounts when you import.</p>
          )}
          {inv.canVoid && (
            <div className="mt-6 space-y-4">
              <Field label="Reason for voiding">
                <input className={inputClass} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
              </Field>
              <Button variant="secondary" disabled={busy} onClick={() => void onVoid()}>
                Void invoice
              </Button>
            </div>
          )}
        </Card>
      )}

      {inv.status === 'void' && inv.voidedAt !== null && inv.voidReason !== null && (
        <Card>
          <p className="text-sm">{`Voided on ${formatDay(inv.voidedAt.slice(0, 10))}. Reason: ${inv.voidReason}`}</p>
          <div className="mt-3 text-sm">
            <TextLink to={`/invoices/${inv.id}/print`}>Print or save as PDF</TextLink>
          </div>
        </Card>
      )}
    </div>
  );
}
