import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, TextLink } from '../../components/ui';
import { InvoiceDocument } from '../../components/InvoiceDocument';
import { ApiError } from '../../lib/api';
import { getInvoice, type InvoiceView } from '../../lib/invoices';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; invoice: InvoiceView };

/** The printable invoice. The toolbar is hidden on paper; Print opens the browser's print dialog (Save as PDF is there too). */
export function InvoicePrint() {
  const { id = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getInvoice(id)
      .then((invoice) => {
        if (!cancelled) setState({ status: 'ready', invoice });
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

  if (state.status === 'loading') return <p className="text-muted">Loading…</p>;
  if (state.status === 'missing') return <h1 className="text-2xl font-semibold">Invoice not found</h1>;
  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-bad">
        {state.message}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden flex flex-wrap items-center gap-4">
        <Button onClick={() => window.print()}>Print</Button>
        <TextLink to={`/invoices/${id}`}>Back to invoice</TextLink>
      </div>
      <InvoiceDocument invoice={state.invoice} />
    </div>
  );
}
