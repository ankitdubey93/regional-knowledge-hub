import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { AdminFacts } from '../pages/admin/AdminFacts';
import { AdminFactNew, AdminFactEdit } from '../pages/admin/AdminFact';
import * as session from '../lib/session';

const admin = {
  session: { userId: 'a1', email: 'admin@x.test', name: 'Admin', activeFirmId: null, activeFirmName: null, activeWorkspaceKind: null, isAdmin: true },
  pending: false,
};

const nonAdmin = {
  session: { userId: 'u9', email: 'ann@x.test', name: 'Ann', activeFirmId: null, activeFirmName: null, activeWorkspaceKind: null, isAdmin: false },
  pending: false,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const rateFact = {
  label: 'Test rate',
  jurisdiction: 'AU' as const,
  unit: 'bp' as const,
  value: 1000,
  effectiveFrom: '2026-07-01',
  source: 'https://www.ato.gov.au/x',
  verifiedOn: null,
};

const factRow = {
  key: 'au.test.rate',
  fact: rateFact,
  updatedBy: 'a1',
  updatedAt: '2026-10-27T00:00:00.000Z',
  docCount: 0,
};

function detail() {
  return { ...factRow, docs: [], history: [] };
}

function saveResult(rechunked: number, embedded: number | null) {
  return { detail: detail(), rechunked, embedded };
}

beforeEach(() => {
  // Call history only: the mocked implementations from setup.ts stay in place.
  vi.clearAllMocks();
});

describe('Admin facts', () => {
  it('AFW1 non-admin sees Page not found on /admin/facts', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(nonAdmin);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/admin/facts', '/admin/facts', <AdminFacts />);
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('AFW2 list shows key, formatted value and Unverified badge', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { facts: [factRow] })));
    renderAt('/admin/facts', '/admin/facts', <AdminFacts />);
    expect(await screen.findByText('10%')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
  });

  it('AFW3 a bad rate shows the unit error and sends no request', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/admin/facts/new', '/admin/facts/new', <AdminFactNew />);
    await user.selectOptions(screen.getByLabelText('Unit'), 'Rate (%)');
    await user.type(screen.getByLabelText('Value'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Create fact' }));
    expect(await screen.findByText('Enter a valid value for this unit')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it('AFW4 a valid rate posts integer basis points', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(201, saveResult(0, null)));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/admin/facts/new', '/admin/facts/new', <AdminFactNew />);
    await user.type(screen.getByLabelText('Key'), 'au.test.rate');
    await user.type(screen.getByLabelText('Label'), 'Test rate');
    await user.selectOptions(screen.getByLabelText('Unit'), 'Rate (%)');
    await user.type(screen.getByLabelText('Value'), '10.5');
    fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: '2026-07-01' } });
    await user.type(screen.getByLabelText('Official source URL'), 'https://www.ato.gov.au/x');
    await user.type(screen.getByLabelText('What changed and why'), 'Added for the test');
    await user.click(screen.getByRole('button', { name: 'Create fact' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/admin/facts');
    expect(init?.method).toBe('POST');
    const sent = JSON.parse(String(init?.body));
    expect(sent.fact.value).toBe(1050);
    expect(sent.fact.verifiedOn).toBeNull();
  });

  it('AFW5 edit shows the re-chunk message', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'PATCH' ? jsonResponse(200, saveResult(2, null)) : jsonResponse(200, { fact: detail() }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/admin/facts/au.test.rate', '/admin/facts/:key', <AdminFactEdit />);
    await screen.findByLabelText('Label');
    await user.type(screen.getByLabelText('What changed and why'), 'Updated the test rate');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/^Saved\. 2 guide version\(s\) re-chunked\./)).toBeInTheDocument();
  });
});
