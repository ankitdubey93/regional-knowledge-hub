import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { Profitability } from '../pages/invoices/Profitability';
import type { EntityProfit } from '@chub/shared/utils/profitability';

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

function row(over: Partial<EntityProfit> = {}): EntityProfit {
  return {
    clientId: 'c1',
    clientName: 'Harbour Co',
    invoiceCount: 2,
    billedCents: 132500,
    minutes: 690,
    costCents: 69000,
    standardCents: 172500,
    realisationBp: 7681,
    marginBp: 4792,
    missingCostMinutes: 0,
    missingRateMinutes: 0,
    engagements: [
      {
        engagementId: 'e2',
        title: 'Year end',
        billedCents: 110000,
        minutes: 600,
        costCents: 60000,
        standardCents: 150000,
        realisationBp: 7333,
        marginBp: 4545,
        missingCostMinutes: 0,
        missingRateMinutes: 0,
      },
    ],
    ...over,
  };
}

function report(entities: EntityProfit[]) {
  return { currency: 'AUD', from: '2026-10-01', to: '2026-10-31', entities };
}

describe('profitability page', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('PFP1 shows entity and engagement figures', async () => {
    stubApi({
      'GET /api/profitability': ok({ report: report([row()]) }),
    });
    renderAt('/profitability?from=2026-10-01&to=2026-10-31', '/profitability', <Profitability />);
    const table = within(await screen.findByRole('table'));
    expect(table.getByText('Harbour Co')).toBeInTheDocument();
    expect(table.getByText('$1,325.00')).toBeInTheDocument();
    expect(table.getByText('11 h 30 min')).toBeInTheDocument();
    expect(table.getByText('76.81%')).toBeInTheDocument();
    expect(table.getByText('47.92%')).toBeInTheDocument();
    expect(table.getByText('Year end')).toBeInTheDocument();
    expect(table.getByText('45.45%')).toBeInTheDocument();
  });

  it('PFP2 n/a and the missing cost note', async () => {
    stubApi({
      'GET /api/profitability': ok({
        report: report([row({ costCents: null, marginBp: null, missingCostMinutes: 60, engagements: [] })]),
      }),
    });
    renderAt('/profitability?from=2026-10-01&to=2026-10-31', '/profitability', <Profitability />);
    await screen.findByRole('table');
    expect(screen.getAllByText('n/a').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Some time has no cost rate/)).toBeInTheDocument();
  });

  it('PFP3 a member sees the 403 message', async () => {
    stubApi({
      'GET /api/profitability': {
        status: 403,
        body: { error: 'Only firm owners and admins can see profitability' },
      },
    });
    renderAt('/profitability?from=2026-10-01&to=2026-10-31', '/profitability', <Profitability />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Only firm owners and admins can see profitability');
  });

  it('PFP4 empty period', async () => {
    stubApi({
      'GET /api/profitability': ok({ report: report([]) }),
    });
    renderAt('/profitability?from=2026-10-01&to=2026-10-31', '/profitability', <Profitability />);
    expect(await screen.findByText('No issued invoices in this period.')).toBeInTheDocument();
  });

  it('PFP5 reads the period from the URL', async () => {
    const fetchMock = stubApi({
      'GET /api/profitability': ok({ report: report([]) }),
    });
    renderAt('/profitability?from=2026-10-01&to=2026-10-31&currency=GBP', '/profitability', <Profitability />);
    await screen.findByText('No issued invoices in this period.');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/profitability?from=2026-10-01&to=2026-10-31&currency=GBP');
  });

  it('PFP6 sort by entity name', async () => {
    const user = userEvent.setup();
    stubApi({
      'GET /api/profitability': ok({
        report: report([
          row({ clientId: 'c1', clientName: 'Harbour Co', marginBp: 1000, engagements: [] }),
          row({ clientId: 'c2', clientName: 'Bay Co', marginBp: 5000, engagements: [] }),
        ]),
      }),
    });
    renderAt('/profitability?from=2026-10-01&to=2026-10-31', '/profitability', <Profitability />);
    await screen.findByRole('table');
    expect(screen.getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['Harbour Co', 'Bay Co']);
    await user.selectOptions(screen.getByLabelText('Sort by'), 'Entity name');
    await waitFor(() => {
      expect(screen.getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['Bay Co', 'Harbour Co']);
    });
  });
});
