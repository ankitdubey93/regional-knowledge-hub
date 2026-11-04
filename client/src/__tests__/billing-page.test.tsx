import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { BillingSettings } from '../pages/workspace/BillingSettings';
import { PricingCard } from '../components/PricingCard';
import type { BillingSettings as Settings } from '../lib/billing';

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

function settings(over: Partial<Settings> = {}): Settings {
  return {
    jurisdiction: 'AU',
    legalName: null,
    address: null,
    taxRegistered: false,
    taxNumber: null,
    paymentDays: 14,
    paymentDetails: '',
    accountCode: '200',
    scheme: null,
    homeCurrency: null,
    ...over,
  };
}

describe('billing page', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('BP1 renders saved details', async () => {
    stubApi({
      'GET /api/billing/settings': ok({ settings: settings({ legalName: 'Ledger Lane Pty Ltd' }), canEdit: true }),
      'GET /api/billing/rates': ok({ rates: [], members: [] }),
    });
    renderAt('/workspace/billing', '/workspace/billing', <BillingSettings />);
    expect(await screen.findByLabelText('Legal name')).toHaveValue('Ledger Lane Pty Ltd');
    expect(screen.getByRole('button', { name: 'Save billing details' })).toBeEnabled();
  });

  it('BP2 members see a read-only form', async () => {
    stubApi({
      'GET /api/billing/settings': ok({ settings: settings({ legalName: 'Ledger Lane Pty Ltd' }), canEdit: false }),
      'GET /api/billing/rates': ok({ rates: [], members: [] }),
    });
    renderAt('/workspace/billing', '/workspace/billing', <BillingSettings />);
    expect(await screen.findByLabelText('Legal name')).toBeDisabled();
    expect(screen.getByText('Only owners and admins can change billing.')).toBeInTheDocument();
  });

  it('BP3 saving sends the fields', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/billing/settings': ok({ settings: settings({ legalName: 'Ledger Lane Pty Ltd' }), canEdit: true }),
      'GET /api/billing/rates': ok({ rates: [], members: [] }),
      'PATCH /api/billing/settings': ok({ settings: settings({ legalName: 'New Name Pty Ltd' }) }),
    });
    renderAt('/workspace/billing', '/workspace/billing', <BillingSettings />);
    const legalName = await screen.findByLabelText('Legal name');
    await user.clear(legalName);
    await user.type(legalName, 'New Name Pty Ltd');
    await user.click(screen.getByRole('button', { name: 'Save billing details' }));
    expect(await screen.findByText('Billing details saved.')).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([url, init]) => url === '/api/billing/settings' && init?.method === 'PATCH');
    const body = JSON.parse(String(patch?.[1]?.body));
    expect(body.legalName).toBe('New Name Pty Ltd');
  });

  it('BP4 rates', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/billing/settings': ok({ settings: settings({ legalName: 'Ledger Lane Pty Ltd' }), canEdit: true }),
      'GET /api/billing/rates': ok({
        rates: [{ userId: null, userName: 'Firm default', currency: 'AUD', centsPerHour: 15000, costCentsPerHour: null }],
        members: [],
      }),
      'PATCH /api/billing/rates': ok({
        rates: [{ userId: null, userName: 'Firm default', currency: 'AUD', centsPerHour: 15000, costCentsPerHour: null }],
      }),
    });
    renderAt('/workspace/billing', '/workspace/billing', <BillingSettings />);
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('Firm default')).toBeInTheDocument();
    expect(table.getByText('$150.00')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Rate per hour'), '150');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([url, init]) => url === '/api/billing/rates' && init?.method === 'PATCH');
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ userId: null, currency: 'AUD', centsPerHour: 15000, costCentsPerHour: null });
    });
  });

  it('BP5 pricing card', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/clients/c1/pricing': ok({ pricing: null, canEdit: true }),
      'PATCH /api/clients/c1/pricing': ok({
        pricing: { clientId: 'c1', model: 'fixed', currency: 'AUD', fixedCents: 110000, retainerCents: null },
      }),
    });
    renderAt('/entities/c1/settings', '/entities/:id/settings', <PricingCard clientId="c1" />);
    await user.selectOptions(await screen.findByLabelText('Pricing model'), 'Fixed fee per engagement');
    await user.type(await screen.findByLabelText('Fixed fee'), '1100');
    await user.click(screen.getByRole('button', { name: 'Save pricing' }));
    expect(await screen.findByText('Pricing saved.')).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([url, init]) => url === '/api/clients/c1/pricing' && init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ model: 'fixed', currency: 'AUD', fixedCents: 110000, retainerCents: null });
  });

  it('BP6 cost rate', async () => {
    const user = userEvent.setup();
    const row = { userId: null, userName: 'Firm default', currency: 'AUD', centsPerHour: 15000, costCentsPerHour: 6000 };
    const fetchMock = stubApi({
      'GET /api/billing/settings': ok({ settings: settings({ legalName: 'Ledger Lane Pty Ltd' }), canEdit: true }),
      'GET /api/billing/rates': ok({ rates: [row], members: [] }),
      'PATCH /api/billing/rates': ok({ rates: [row] }),
    });
    renderAt('/workspace/billing', '/workspace/billing', <BillingSettings />);
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('$60.00')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Rate per hour'), '150');
    await user.type(screen.getByLabelText('Cost per hour (optional)'), '80');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([url, init]) => url === '/api/billing/rates' && init?.method === 'PATCH');
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ userId: null, currency: 'AUD', centsPerHour: 15000, costCentsPerHour: 8000 });
    });
  });
});
