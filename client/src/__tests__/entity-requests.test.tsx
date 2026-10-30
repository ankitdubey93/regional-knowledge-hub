import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { EntityRequests } from '../pages/entity/EntityRequests';
import type { RequestView } from '../lib/requests';

const acme = {
  id: 'c1',
  name: 'Acme Pty Ltd',
  jurisdiction: 'AU',
  notes: '',
  entities: [],
  isSelf: false,
  entityType: 'company',
  taxRegistered: false,
  taxPeriod: null,
  fyEndMonth: 6,
  timezone: null,
  registeredOn: null,
  vatStaggerMonth: null,
  mtdItsa: false,
};

function req(over: Partial<RequestView> = {}): RequestView {
  return {
    id: 'r1',
    clientId: 'c1',
    itemId: 'au.bas.bankStatements',
    label: 'Bank statements for the period: BAS for the quarter ending 30 September 2026',
    why: 'To reconcile the BAS figures.',
    docId: 'australia/bas-gst-guide',
    sourceUrl: 'https://www.ato.gov.au/x',
    verifiedOn: null,
    dueOn: '2026-10-14',
    status: 'open',
    source: 'obligation',
    obligationId: 'au_bas:2026-09-30',
    createdBy: 'u1',
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    ...over,
  };
}

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

function renderPage() {
  renderAt('/entities/c1/requests', '/entities/:id/requests', <EntityRequests />);
}

const EMPTY_TEXT = 'No requests yet. Generate them from the profile or add one.';
const BANK = 'Bank statements for the period: BAS for the quarter ending 30 September 2026';

describe('Entity requests (C2)', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('ER1 shows the send note and the empty state', async () => {
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/requests': ok({ requests: [] }),
    });
    renderPage();
    expect(await screen.findByText(EMPTY_TEXT)).toBeInTheDocument();
    expect(screen.getByText('Send open requests to the client with an upload link below.', { exact: false })).toBeInTheDocument();
  });

  it('ER2 lists a request with its due date and an unchecked source', async () => {
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/requests': ok({ requests: [req()] }),
    });
    renderPage();
    expect(await screen.findByText('14 October 2026')).toBeInTheDocument();
    expect(screen.getByText('To reconcile the BAS figures.')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Not checked' })).toHaveAttribute('href', 'https://www.ato.gov.au/x');
  });

  it('ER3 generate replaces the list and reports the count', async () => {
    const user = userEvent.setup();
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/requests': ok({ requests: [] }),
      'POST /api/clients/c1/requests/generate': ok({
        created: 2,
        requests: [
          req(),
          req({ id: 'r2', itemId: 'au.ye.loans', label: 'Loan statements at year end', dueOn: null, source: 'rule', obligationId: null }),
        ],
      }),
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Generate from profile' }));
    expect(await screen.findByText('Added 2 requests.')).toBeInTheDocument();
    expect(screen.getByText('No date')).toBeInTheDocument();
  });

  it('ER4 a generate error is shown', async () => {
    const user = userEvent.setup();
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/requests': ok({ requests: [] }),
      'POST /api/clients/c1/requests/generate': {
        status: 422,
        body: { error: 'Set the entity type, and use one country, to generate requests' },
      },
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Generate from profile' }));
    expect(await screen.findByText('Set the entity type, and use one country, to generate requests')).toBeInTheDocument();
  });

  it('ER5 add posts the label and a null date', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/requests': ok({ requests: [] }),
      'POST /api/clients/c1/requests': {
        status: 201,
        body: {
          request: req({
            id: 'r3',
            label: 'Signed engagement letter',
            why: '',
            dueOn: null,
            source: 'manual',
            itemId: 'manual.1',
            obligationId: null,
            sourceUrl: null,
            docId: null,
          }),
        },
      },
    });
    renderPage();
    await user.type(await screen.findByLabelText('What to ask for'), 'Signed engagement letter');
    await user.click(screen.getByRole('button', { name: 'Add request' }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/clients/c1/requests');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ label: 'Signed engagement letter', dueOn: null });
    expect(await screen.findByText('Signed engagement letter')).toBeInTheDocument();
    expect(screen.getByText('Added by staff')).toBeInTheDocument();
  });

  it('ER6 mark received sends PATCH and shows Reopen', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/requests': ok({ requests: [req()] }),
      'PATCH /api/clients/c1/requests/r1': ok({ request: req({ status: 'received' }) }),
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: `Mark ${BANK} received` }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toBe('/api/clients/c1/requests/r1');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ status: 'received' });
    expect(await screen.findByText('Received')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Reopen ${BANK}` })).toBeInTheDocument();
  });

  it('ER7 delete asks for confirmation and calls DELETE', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      const fetchMock = stubApi({
        'GET /api/clients/c1': ok({ client: acme }),
        'GET /api/clients/c1/requests': ok({ requests: [req()] }),
        'DELETE /api/clients/c1/requests/r1': ok({}),
      });
      renderPage();
      await user.click(await screen.findByRole('button', { name: `Delete ${BANK}` }));
      expect(confirm).toHaveBeenCalledWith('Delete this request?');
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('/api/clients/c1/requests/r1', expect.objectContaining({ method: 'DELETE' }));
      });
      expect(await screen.findByText(EMPTY_TEXT)).toBeInTheDocument();
    } finally {
      confirm.mockRestore();
    }
  });

  it('ER8 an unknown entity', async () => {
    stubApi({
      'GET /api/clients/c1': { status: 404, body: { error: 'Client not found' } },
    });
    renderPage();
    expect(await screen.findByText('Client not found.')).toBeInTheDocument();
  });
});
