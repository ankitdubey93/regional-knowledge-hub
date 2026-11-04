import { TableScroll } from './ui';
import type { InvoiceView } from '../lib/invoices';
import { formatDay } from '@chub/shared/utils/deadlines';
import { formatMoney, formatRate } from '@chub/shared/utils/money';
import { formatMinutes } from '@chub/shared/utils/workload';
import { documentTitle, formatFxRate, taxLabel, taxNumberLabel, treatmentLabel } from '@chub/shared/utils/invoice';

/** The invoice as a document. The server computes every amount and the rate; this renders them. */
export function InvoiceDocument({ invoice }: { invoice: InvoiceView }) {
  const { taxScheme, currency, homeCurrency, seller } = invoice;
  const label = taxLabel(taxScheme);
  const title = invoice.status === 'draft' ? `Draft ${documentTitle(taxScheme).toLowerCase()}` : documentTitle(taxScheme);

  return (
    <article className="invoice-doc min-w-0 space-y-8 rounded-3xl bg-panel p-6 text-ink sm:p-10">
      {invoice.status === 'void' && (
        <div>
          <p role="note" className="font-semibold text-bad">
            This invoice is void.
          </p>
          {invoice.voidReason !== null && <p>{invoice.voidReason}</p>}
        </div>
      )}

      <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{title}</h1>

      <div className="space-y-1 text-sm">
        <p className="font-semibold">{seller.name ?? 'Your firm name'}</p>
        {seller.address !== null && <p className="whitespace-pre-line">{seller.address}</p>}
        {seller.taxNumber !== null && seller.jurisdiction !== null && (
          <p>{`${taxNumberLabel(seller.jurisdiction)} ${seller.taxNumber}`}</p>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="font-semibold">Invoice number</dt>
        <dd>{invoice.displayNumber ?? 'Not issued'}</dd>
        <dt className="font-semibold">Date of issue</dt>
        <dd>{invoice.issuedOn !== null ? formatDay(invoice.issuedOn) : 'Not issued'}</dd>
        <dt className="font-semibold">Due date</dt>
        <dd>{invoice.dueOn !== null ? formatDay(invoice.dueOn) : 'Not issued'}</dd>
        {invoice.reference !== '' && (
          <>
            <dt className="font-semibold">Reference</dt>
            <dd>{invoice.reference}</dd>
          </>
        )}
      </dl>

      <div className="space-y-1 text-sm">
        <h2 className="font-semibold">Bill to</h2>
        <p>{invoice.buyerName}</p>
        {invoice.buyerAddress !== '' && <p className="whitespace-pre-line">{invoice.buyerAddress}</p>}
        {invoice.buyerTaxNumber !== '' && <p>{invoice.buyerTaxNumber}</p>}
      </div>

      <TableScroll>
        <table className="w-full text-left text-sm">
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
              {taxScheme !== 'none' && (
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {label}
                </th>
              )}
              <th scope="col" className="py-2 font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-b border-line align-top">
                <td className="py-2 pr-3">{line.description}</td>
                <td className="num py-2 pr-3">{line.kind === 'time' && line.minutes !== null ? formatMinutes(line.minutes) : '1'}</td>
                <td className="num py-2 pr-3">
                  {line.kind === 'time' ? `${formatMoney(line.unitCents, currency)}/hour` : formatMoney(line.unitCents, currency)}
                </td>
                {taxScheme !== 'none' && (
                  <td className="py-2 pr-3">
                    {line.taxTreatment === 'standard' ? formatRate(invoice.taxRateBp) : treatmentLabel(taxScheme, line.taxTreatment)}
                  </td>
                )}
                <td className="num py-2">{formatMoney(line.amountCents, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
        <dt>{taxScheme === 'none' || label === null ? 'Subtotal' : `Subtotal (excluding ${label})`}</dt>
        <dd className="num">{formatMoney(invoice.subtotalCents, currency)}</dd>
        {taxScheme !== 'none' && label !== null && invoice.noTaxSubtotalCents > 0 && (
          <>
            <dt>{`Total with no ${label}`}</dt>
            <dd className="num">{formatMoney(invoice.noTaxSubtotalCents, currency)}</dd>
          </>
        )}
        {taxScheme !== 'none' && label !== null && (
          <>
            <dt>{`${label} at ${formatRate(invoice.taxRateBp)}`}</dt>
            <dd className="num">{formatMoney(invoice.taxCents, currency)}</dd>
          </>
        )}
        <dt className="font-semibold">Total</dt>
        <dd className="num font-semibold">{formatMoney(invoice.totalCents, currency)}</dd>
      </dl>

      {invoice.fxRateMicros !== null &&
        homeCurrency !== null &&
        invoice.fxRateDate !== null &&
        invoice.fxRateSource !== null && (
          <div className="ml-auto max-w-sm space-y-2 text-sm">
            <p>{`Exchange rate: 1 ${currency} = ${formatFxRate(invoice.fxRateMicros)} ${homeCurrency} (${formatDay(invoice.fxRateDate)}, ${invoice.fxRateSource})`}</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
              {invoice.taxHomeCents !== null && label !== null && (
                <>
                  <dt>{`${label} in ${homeCurrency}`}</dt>
                  <dd className="num">{formatMoney(invoice.taxHomeCents, homeCurrency)}</dd>
                </>
              )}
              {invoice.totalHomeCents !== null && (
                <>
                  <dt>{`Total in ${homeCurrency}`}</dt>
                  <dd className="num">{formatMoney(invoice.totalHomeCents, homeCurrency)}</dd>
                </>
              )}
            </dl>
          </div>
        )}

      {seller.paymentDetails !== '' && (
        <div className="space-y-2 text-sm">
          <h2 className="font-semibold">Payment details</h2>
          <p className="whitespace-pre-line">{seller.paymentDetails}</p>
        </div>
      )}

      {invoice.notes !== '' && (
        <div className="space-y-2 text-sm">
          <h2 className="font-semibold">Notes</h2>
          <p className="whitespace-pre-line">{invoice.notes}</p>
        </div>
      )}
    </article>
  );
}
