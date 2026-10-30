import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { UploadRequest } from '../pages/public/UploadRequest';

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
  renderAt('/r/tok', '/r/:token', <UploadRequest />);
}

const PUBLIC = '/api/public/requests/tok';
const SMITH = {
  firmName: 'Smith & Co',
  expiresOn: '2026-11-29',
  items: [
    { id: 'r1', label: 'Bank statements', received: false },
    { id: 'r2', label: 'Payroll reports', received: true },
  ],
};

describe('Public upload page (C3)', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('PU1 shows the firm, expiry and items', async () => {
    stubApi({
      [`GET ${PUBLIC}`]: ok({ request: SMITH }),
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Documents requested' })).toBeInTheDocument();
    expect(screen.getByText('29 November 2026', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Waiting for a file.')).toBeInTheDocument();
    expect(screen.getByText('Uploaded. You can upload a newer version if needed.')).toBeInTheDocument();
  });

  it('PU2 an invalid link', async () => {
    stubApi({
      [`GET ${PUBLIC}`]: { status: 404, body: { error: 'This link is not valid or has expired' } },
    });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'This link is not valid' })).toBeInTheDocument();
  });

  it('PU3 an upload posts the file and thanks the client', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      [`GET ${PUBLIC}`]: ok({ request: SMITH }),
      [`POST ${PUBLIC}/items/r1/upload`]: {
        status: 201,
        body: { item: { id: 'r1', label: 'Bank statements', received: true } },
      },
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Documents requested' });
    const file = new File(['statement'], 'bank.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('File for Bank statements'), file);
    await user.click(screen.getByRole('button', { name: 'Upload Bank statements' }));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`${PUBLIC}/items/r1/upload`, expect.objectContaining({ method: 'POST' }));
    });
    const upload = fetchMock.mock.calls.find(([url]) => url === `${PUBLIC}/items/r1/upload`);
    expect(new Headers(upload?.[1]?.headers).get('X-Filename')).toBe('bank.txt');
    expect(await screen.findByText('Uploaded. Thank you.')).toBeInTheDocument();
  });

  it('PU4 a refused file shows the server message', async () => {
    const user = userEvent.setup();
    const message = 'Upload a PDF, Word (.docx), Excel (.xlsx), CSV, text or Markdown file';
    stubApi({
      [`GET ${PUBLIC}`]: ok({ request: SMITH }),
      [`POST ${PUBLIC}/items/r1/upload`]: { status: 415, body: { error: message } },
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Documents requested' });
    const file = new File(['statement'], 'bank.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('File for Bank statements'), file);
    await user.click(screen.getByRole('button', { name: 'Upload Bank statements' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });
});
