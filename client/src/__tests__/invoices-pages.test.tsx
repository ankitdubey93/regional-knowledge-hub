import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InvoicesList } from '../pages/invoices/InvoicesList';
import { InvoiceDetail } from '../pages/invoices/InvoiceDetail';
import { InvoicePrint } from '../pages/invoices/InvoicePrint';
import type { InvoiceSummary, InvoiceView } from '../lib/invoices';
import { INVOICE_CONTENT_CHECKED_ON } from '@chub/shared/utils/invoice';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Stub {
  status: number;
  body: unknown;
}
const ok = (body: unknown): Stub => ({ status: 200, body });

/** Routes fetch by "METHOD /path" (query string ignored). Unknown routes answer 404, so nothing reaches the network. */
function stubApi(routes: Record<string, Stub>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url.split('?')[0] ?? url}`;
    const stub = routes[key];
    if (!stub) return jsonResponse(404, { error: `No stub for ${key}` });
    return jsonResponse(stub.status, stub.body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** A draft AU invoice: one time line of 90 minutes at $150.00 an hour, GST at 10%. */
function invoice(over: Partial<InvoiceView> = {}): InvoiceView {
  return {
    id: 'i1',
    number: null,
    displayNumber: null,
    status: 'draft',
    clientId: 'c1',
    clientName: 'Harbour Co',
    clientJurisdiction: 'AU',
    buyerName: '',
    engagementId: null,
    engagementTitle: null,
    currency: 'AUD',
    homeCurrency: 'AUD',
    needsFx: false,
    taxScheme: 'au_gst',
    taxFactKey: 'au.gst.rate',
    taxRateBp: 1000,
    rateFactVerifiedOn: '2026-10-26',
    periodFrom: '2026-10-01',
    periodTo: '2026-10-31',
    buyerAddress: '',
    buyerTaxNumber: '',
    reference: '',
    notes: '',
    issuedOn: null,
    dueOn: null,
    seller: {
      jurisdiction: 'AU',
      name: 'Ledger Lane Pty Ltd',
      address: '1 George St',
      taxNumber: '12345678901',
      paymentDetails: 'BSB 000-000',
    },
    subtotalCents: 22500,
    taxCents: 2250,
    totalCents: 24750,
    noTaxSubtotalCents: 0,
    fxRateMicros: null,
    fxRateDate: null,
    fxRateSource: null,
    taxHomeCents: null,
    totalHomeCents: null,
    voidedAt: null,
    voidReason: null,
    allowedTreatments: ['standard', 'zero', 'outside'],
    canEdit: true,
    canIssue: true,
    canVoid: false,
    lines: [
      {
        id: 'l1',
        position: 1,
        kind: 'time',
        description: 'Bank rec',
        timeEntryId: null,
        minutes: 90,
        unitCents: 15000,
        amountCents: 22500,
        taxTreatment: 'standard',
        taxCents: 2250,
      },
    ],
    createdAt: '2026-11-02T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
    ...over,
  };
}

function summary(over: Partial<InvoiceSummary> = {}): InvoiceSummary {
  return {
    id: 'i1',
    number: null,
    displayNumber: null,
    status: 'draft',
    clientId: 'c1',
    clientName: 'Harbour Co',
    currency: 'AUD',
    totalCents: 24750,
    issuedOn: null,
    dueOn: null,
    createdAt: '2026-11-02T00:00:00.000Z',
    ...over,
  };
}

const clientRoutes: Record<string, Stub> = {
  'GET /api/clients': ok({ clients: [{ id: 'c1', name: 'Harbour Co' }] }),
  'GET /api/clients/c1/engagements': ok({ engagements: [], autoEngagements: false }),
};

/** The invoice pages on their real routes, so a navigation from the list to a draft works. */
function renderRoutes(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invoices" element={<InvoicesList />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/invoices/:id/print" element={<InvoicePrint />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('invoice pages', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('IP1 the list', async () => {
    const user = userEvent.setup();
    const issued = summary({ id: 'i1', number: 1, displayNumber: 'INV-0001', status: 'issued', issuedOn: '2026-11-02', dueOn: '2026-11-16' });
    const draft = summary({ id: 'i2', displayNumber: null, status: 'draft' });
    const fetchMock = stubApi({ ...clientRoutes, 'GET /api/invoices': ok({ invoices: [issued, draft] }) });
    renderRoutes('/invoices');
    expect(await screen.findByRole('link', { name: 'INV-0001' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Draft' })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Issued' }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/invoices?status=issued'))).toBe(true);
    });
  });

  it('IP2 creating a draft', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      ...clientRoutes,
      'GET /api/invoices': ok({ invoices: [] }),
      'POST /api/invoices': { status: 201, body: { invoice: invoice() } },
      'GET /api/invoices/i1': ok({ invoice: invoice() }),
    });
    renderRoutes('/invoices');
    await waitFor(() => expect(screen.getByLabelText('Entity')).toHaveValue('c1'));
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Draft invoice' })).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/invoices' && init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body)).engagementId).toBeNull();
  });

  it('IP3 draft totals', async () => {
    stubApi({ 'GET /api/invoices/i1': ok({ invoice: invoice() }) });
    renderRoutes('/invoices/i1');
    expect(await screen.findByText('Subtotal (excluding GST)')).toBeInTheDocument();
    expect(screen.getByText('GST at 10%')).toBeInTheDocument();
    expect(screen.getByText('$247.50')).toBeInTheDocument();
  });

  it('IP4 the content check callout follows the constant', async () => {
    stubApi({ 'GET /api/invoices/i1': ok({ invoice: invoice() }) });
    renderRoutes('/invoices/i1');
    await screen.findByRole('heading', { level: 1, name: 'Draft invoice' });
    expect(screen.queryByText(/has not been checked against the ATO/) !== null).toBe(INVOICE_CONTENT_CHECKED_ON.au_gst === null);
  });

  it('IP5 only owners and admins issue', async () => {
    stubApi({ 'GET /api/invoices/i1': ok({ invoice: invoice({ canIssue: false }) }) });
    renderRoutes('/invoices/i1');
    await screen.findByRole('heading', { level: 1, name: 'Draft invoice' });
    expect(screen.queryByRole('button', { name: 'Issue invoice' })).toBeNull();
    expect(screen.getByText('An owner or admin issues invoices.')).toBeInTheDocument();
  });

  it('IP6 issued actions', async () => {
    stubApi({
      'GET /api/invoices/i1': ok({
        invoice: invoice({ status: 'issued', displayNumber: 'INV-0001', canEdit: false, canVoid: true }),
      }),
    });
    renderRoutes('/invoices/i1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Tax invoice INV-0001' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Print or save as PDF' })).toHaveAttribute('href', '/invoices/i1/print');
    expect(screen.getByRole('link', { name: 'Download CSV for Xero' })).toHaveAttribute('href', '/api/invoices/i1/csv');
  });

  it('IP7 the print page', async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    stubApi({
      'GET /api/invoices/i1': ok({ invoice: invoice({ status: 'issued', displayNumber: 'INV-0001' }) }),
    });
    renderRoutes('/invoices/i1/print');
    expect(await screen.findByRole('heading', { level: 1, name: 'Tax invoice' })).toBeInTheDocument();
    expect(screen.getByText('ABN 12345678901')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bill to' })).toBeInTheDocument();
    expect(screen.getByText('INV-0001')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('IP8 another currency asks for a rate', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/invoices/i1': ok({ invoice: invoice({ currency: 'GBP', homeCurrency: 'AUD', needsFx: true }) }),
      'PATCH /api/invoices/i1': ok({ invoice: invoice({ currency: 'GBP', homeCurrency: 'AUD', needsFx: true }) }),
    });
    renderRoutes('/invoices/i1');
    await screen.findByRole('heading', { level: 1, name: 'Draft invoice' });
    await user.type(screen.getByLabelText('Rate (AUD per 1 GBP)'), '1.95');
    fireEvent.change(screen.getByLabelText('Rate date'), { target: { value: '2026-11-02' } });
    await user.type(screen.getByLabelText('Rate source'), 'RBA');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([url, init]) => url === '/api/invoices/i1' && init?.method === 'PATCH');
      expect(JSON.parse(String(patch?.[1]?.body)).fx).toEqual({ rateMicros: 1950000, date: '2026-11-02', source: 'RBA' });
    });
  });

  it('IP9 a void invoice prints as void', async () => {
    stubApi({
      'GET /api/invoices/i1': ok({
        invoice: invoice({ status: 'void', displayNumber: 'INV-0001', voidReason: 'Wrong client', voidedAt: '2026-11-03T00:00:00.000Z' }),
      }),
    });
    renderRoutes('/invoices/i1/print');
    expect(await screen.findByText('This invoice is void.')).toBeInTheDocument();
    expect(screen.getByText('Wrong client')).toBeInTheDocument();
  });
});
