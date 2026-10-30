import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { RequestLinks } from '../components/RequestLinks';
import type { RequestView } from '../lib/requests';
import { parseCadence, type RequestLinkView } from '../lib/requestLinks';

function req(over: Partial<RequestView> = {}): RequestView {
  return {
    id: 'r1',
    clientId: 'c1',
    itemId: 'manual.1',
    label: 'Bank statements',
    why: '',
    docId: null,
    sourceUrl: null,
    verifiedOn: null,
    dueOn: null,
    status: 'open',
    source: 'manual',
    obligationId: null,
    createdBy: 'u1',
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    ...over,
  };
}

const open1 = req({ id: 'r1', label: 'Bank statements' });
const open2 = req({ id: 'r2', label: 'Sales invoices' });
const received1 = req({ id: 'r3', label: 'Payroll reports', status: 'received' });

function link(over: Partial<RequestLinkView> = {}): RequestLinkView {
  return {
    id: 'l1',
    clientId: 'c1',
    recipientEmail: 'a@example.com',
    requestIds: ['r1'],
    expiresAt: '2026-11-29T00:00:00.000Z',
    revokedAt: null,
    paused: false,
    cadenceDays: [3, 7, 14],
    nudgeCount: 0,
    lastNudgedAt: null,
    openItems: 1,
    status: 'active',
    createdBy: 'u1',
    createdAt: '2026-10-30T00:00:00.000Z',
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

function renderComponent() {
  renderAt('/x', '/x', <RequestLinks clientId="c1" requests={[open1, open2, received1]} />);
}

const LIST = '/api/clients/c1/request-links';

describe('Request links (C3) staff panel', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('RLW1 parseCadence reads comma lists', () => {
    expect(parseCadence('3, 7, 14')).toEqual([3, 7, 14]);
    expect(parseCadence('')).toEqual([]);
    expect(parseCadence('7, 3')).toBeNull();
    expect(parseCadence('x')).toBeNull();
    expect(parseCadence('0')).toBeNull();
    expect(parseCadence('3,3')).toBeNull();
  });

  it('RLW2 send posts the ticked open requests', async () => {
    const user = userEvent.setup();
    const created = link({ id: 'l2', recipientEmail: 'client@example.com', requestIds: ['r1', 'r2'], openItems: 2 });
    const fetchMock = stubApi({
      [`GET ${LIST}`]: ok({ links: [] }),
      [`POST ${LIST}`]: ok({ link: created, url: 'http://localhost:5190/r/tok', emailSent: true }),
    });
    renderComponent();
    expect(await screen.findByText('No links sent yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Include Bank statements' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Include Sales invoices' })).toBeChecked();

    await user.type(screen.getByLabelText('Client email'), 'client@example.com');
    await user.click(screen.getByRole('button', { name: 'Send link' }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe(LIST);
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      recipientEmail: 'client@example.com',
      requestIds: ['r1', 'r2'],
      expiresInDays: 30,
      cadenceDays: [3, 7, 14],
    });
    expect(await screen.findByText('Link sent to the client.')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload link (shown once)')).toHaveValue('http://localhost:5190/r/tok');
  });

  it('RLW3 a failed email tells staff to copy the link', async () => {
    const user = userEvent.setup();
    stubApi({
      [`GET ${LIST}`]: ok({ links: [] }),
      [`POST ${LIST}`]: ok({ link: link({ id: 'l3', recipientEmail: 'client@example.com' }), url: 'http://localhost:5190/r/tok', emailSent: false }),
    });
    renderComponent();
    await screen.findByText('No links sent yet.');
    await user.type(screen.getByLabelText('Client email'), 'client@example.com');
    await user.click(screen.getByRole('button', { name: 'Send link' }));
    expect(await screen.findByText('The email could not be sent. Copy the link below and send it yourself.')).toBeInTheDocument();
  });

  it('RLW4 pause sends PATCH', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      [`GET ${LIST}`]: ok({ links: [link()] }),
      [`PATCH ${LIST}/l1`]: ok({ link: link({ paused: true, status: 'paused' }) }),
    });
    renderComponent();
    await user.click(await screen.findByRole('button', { name: 'Pause reminders to a@example.com' }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toBe(`${LIST}/l1`);
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ paused: true });
    expect(await screen.findByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume reminders to a@example.com' })).toBeInTheDocument();
  });

  it('RLW5 revoke confirms and deletes', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      const fetchMock = stubApi({
        [`GET ${LIST}`]: ok({ links: [link()] }),
        [`DELETE ${LIST}/l1`]: ok({}),
      });
      renderComponent();
      await user.click(await screen.findByRole('button', { name: 'Revoke link to a@example.com' }));
      expect(confirm).toHaveBeenCalledWith('Revoke this link? The client will no longer be able to upload.');
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(`${LIST}/l1`, expect.objectContaining({ method: 'DELETE' }));
      });
    } finally {
      confirm.mockRestore();
    }
  });

  it('RLW6 nothing ticked is refused', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      [`GET ${LIST}`]: ok({ links: [] }),
    });
    renderComponent();
    await screen.findByText('No links sent yet.');
    await user.type(screen.getByLabelText('Client email'), 'client@example.com');
    await user.click(screen.getByRole('checkbox', { name: 'Include Bank statements' }));
    await user.click(screen.getByRole('checkbox', { name: 'Include Sales invoices' }));
    await user.click(screen.getByRole('button', { name: 'Send link' }));
    expect(await screen.findByText('Choose at least one request')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
});
