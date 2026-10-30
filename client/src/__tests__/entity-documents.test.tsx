import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { EntityDocuments } from '../pages/entity/EntityDocuments';
import type { DocumentView } from '../lib/documents';

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

function doc(over: Partial<DocumentView> = {}): DocumentView {
  return {
    id: 'd1',
    clientId: 'c1',
    originalName: 'ledger.csv',
    kind: 'csv',
    byteSize: 2048,
    textChars: 120,
    truncated: false,
    uploadedBy: 'u1',
    requestId: null,
    supersedesId: null,
    fromClientLink: false,
    createdAt: '2026-10-27T00:00:00.000Z',
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
  renderAt('/entities/c1/documents', '/entities/:id/documents', <EntityDocuments />);
}

describe('Entity documents (P4b)', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('ED1 shows the privacy note and the empty state', async () => {
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/documents': ok({ documents: [] }),
    });
    renderPage();
    expect(await screen.findByText('No documents yet.')).toBeInTheDocument();
    expect(screen.getByText('Other names are not caught: staff, directors, suppliers and customers reach the AI as written', { exact: false })).toBeInTheDocument();
  });

  it('ED2 lists documents with type and size', async () => {
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/documents': ok({ documents: [doc()] }),
    });
    renderPage();
    expect(await screen.findByText('ledger.csv')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();
  });

  it('ED3 uploading a file posts raw bytes with X-Filename', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/documents': ok({ documents: [] }),
      'POST /api/clients/c1/documents': { status: 201, body: { document: doc({ originalName: 'a b.csv' }) } },
    });
    renderPage();
    await screen.findByText('No documents yet.');
    const file = new File(['Account,Amount\nSales,1234.50\n'], 'a b.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText(/^Upload a document/), file);
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/clients/c1/documents');
    const init = post?.[1];
    expect(init?.body).toBe(file);
    expect(init?.headers).toEqual(expect.objectContaining({ 'X-Filename': 'a%20b.csv' }));
  });

  it('ED4 delete asks for confirmation and calls DELETE', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      const fetchMock = stubApi({
        'GET /api/clients/c1': ok({ client: acme }),
        'GET /api/clients/c1/documents': ok({ documents: [doc()] }),
        'DELETE /api/clients/c1/documents/d1': ok({}),
      });
      renderPage();
      await user.click(await screen.findByRole('button', { name: 'Delete ledger.csv' }));
      expect(confirm).toHaveBeenCalledWith('Delete this document? It will be removed from every chat it is attached to.');
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith('/api/clients/c1/documents/d1', expect.objectContaining({ method: 'DELETE' }));
      });
    } finally {
      confirm.mockRestore();
    }
  });

  it('ED5 a truncated document says only the first part is used', async () => {
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/documents': ok({ documents: [doc({ originalName: 'big.txt', kind: 'text', truncated: true })] }),
    });
    renderPage();
    expect(await screen.findByText(/only the first part is used/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download big.txt' })).toHaveAttribute('href', '/api/clients/c1/documents/d1/file');
  });
});
