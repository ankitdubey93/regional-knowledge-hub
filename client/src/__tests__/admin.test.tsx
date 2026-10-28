import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderAt } from './render';
import { AdminUsers } from '../pages/admin/AdminUsers';
import { AdminHome } from '../pages/admin/AdminHome';
import { AdminKbNew } from '../pages/admin/AdminKbNew';
import { AdminKbVersion } from '../pages/admin/AdminKbVersion';
import { AdminKbSearch } from '../pages/admin/AdminKbSearch';
import { Layout } from '../components/Layout';
import * as session from '../lib/session';

const admin = {
  session: { userId: 'a1', email: 'admin@x.test', name: 'Admin', activeFirmId: null, activeFirmName: null, activeWorkspaceKind: null, isAdmin: true },
  pending: false,
};

const nonAdmin = {
  session: { userId: 'u9', email: 'ann@x.test', name: 'Ann', activeFirmId: null, activeFirmName: null, activeWorkspaceKind: null, isAdmin: false },
  pending: false,
};

const nonAdminWithFirm = {
  session: {
    userId: 'u9',
    email: 'ann@x.test',
    name: 'Ann',
    activeFirmId: 'org1',
    activeFirmName: 'Firm A',
    activeWorkspaceKind: 'practice' as const,
    isAdmin: false,
  },
  pending: false,
};

const beaList = {
  users: [
    {
      id: 'u2',
      name: 'Bea',
      email: 'bea@x.test',
      createdAt: '2026-10-01T00:00:00.000Z',
      banned: false,
      isPlatformAdmin: false,
      lastActiveAt: null,
      workspaces: [{ id: 'o1', name: 'Bea Books', kind: 'practice', role: 'owner' }],
    },
  ],
  total: 1,
  page: 1,
  pageSize: 50,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  // Call history only: the mocked implementations from setup.ts stay in place.
  vi.clearAllMocks();
});

describe('Admin users', () => {
  it('U1 a non-admin sees Page not found', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(nonAdmin);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/admin/users', '/admin/users', <AdminUsers />);
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('U2 lists users with status and workspaces', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, beaList)));
    renderAt('/admin/users', '/admin/users', <AdminUsers />);
    expect(await screen.findByRole('cell', { name: 'bea@x.test' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Bea Books' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Never' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Active' })).toBeInTheDocument();
  });

  it('U3 bans with a reason', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/ban')) return jsonResponse(200, { ok: true });
      return jsonResponse(200, beaList);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/admin/users', '/admin/users', <AdminUsers />);
    await user.click(await screen.findByRole('button', { name: 'Ban bea@x.test' }));
    await user.type(screen.getByLabelText('Reason for banning bea@x.test'), 'Spam account');
    await user.click(screen.getByRole('button', { name: 'Confirm ban' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/users/u2/ban',
      expect.objectContaining({ method: 'POST', body: '{"reason":"Spam account"}' }),
    );
  });
});

describe('Admin nav link', () => {
  it('N1 shows Admin only to the platform admin', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    const { unmount } = renderAt('/', '/', <Layout />);
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
    unmount();

    vi.mocked(session.useSessionInfo).mockReturnValue(nonAdminWithFirm);
    renderAt('/', '/', <Layout />);
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });
});

const kbSource = {
  id: 's1',
  jurisdiction: 'AU',
  kind: 'act',
  title: 'Test Act',
  citation: 'Test Act 1999 (Cth)',
  officialUrl: null,
  publisher: '',
  billStatus: null,
  enactedAsSourceId: null,
  sitePath: null,
  createdBy: 'a1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function versionDetail(overrides: { issues: { level: 'block' | 'warn'; code: string; message: string }[] }) {
  return {
    version: {
      id: 'v1',
      sourceId: 's1',
      label: 'Compilation 1',
      status: 'draft',
      effectiveFrom: null,
      effectiveTo: null,
      retrievedOn: '2026-10-26',
      inputMethod: 'paste',
      originalName: null,
      bodyMd: '## Section 1 A\n\nBody',
      sha256: 'abc',
      changeNote: '',
      issues: overrides.issues,
      createdBy: 'a1',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
      publishedAt: null,
      publishedBy: null,
    },
    source: kbSource,
    chunks: [],
    diff: { against: null, added: [], changed: [], removed: [], unchanged: 0 },
  };
}

describe('Admin knowledge base', () => {
  it('KW1 creates a draft from pasted text and opens it', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse(201, { detail: { version: { id: 'v1' } } });
      return jsonResponse(200, { source: kbSource, versions: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/kb/new?source=s1']}>
        <Routes>
          <Route path="/admin/kb/new" element={<AdminKbNew />} />
          <Route path="/admin/kb/versions/:id" element={<p>version page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Test Act');
    await user.type(screen.getByLabelText(/Version label/), 'Compilation 1');
    await user.type(screen.getByLabelText(/^Text/), '## Section 1 A\n\nBody');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('version page')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/admin/kb/sources/s1/versions');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ method: 'paste', label: 'Compilation 1' });
  });

  it('KW2 Publish is disabled while a blocking issue remains', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    const detail = versionDetail({
      issues: [{ level: 'block', code: 'no_url', message: 'Add the official URL for this source' }],
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { detail })));
    renderAt('/admin/kb/versions/v1', '/admin/kb/versions/:id', <AdminKbVersion />);
    expect(await screen.findByText('Add the official URL for this source')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });

  it('KW3 search results show the Bill badge and the keyword-only note', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    const response = {
      mode: 'fts',
      results: [
        {
          chunkId: 'c1',
          rank: 1,
          score: 0.5,
          ftsRank: 1,
          vectorRank: null,
          sourceId: 's2',
          title: 'Test Bill',
          citation: 'Test Bill 2026 (Cth)',
          kind: 'bill',
          jurisdiction: 'AU',
          billStatus: 'introduced',
          officialUrl: null,
          sitePath: null,
          versionId: 'v2',
          versionLabel: 'As introduced',
          effectiveFrom: null,
          headingPath: ['Part 1'],
          provisionRef: null,
          text: 'Bill text',
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, response)));
    const user = userEvent.setup();
    renderAt('/admin/kb/search', '/admin/kb/search', <AdminKbSearch />);
    await user.type(screen.getByLabelText('Question'), 'when must I register');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Bill: not law')).toBeInTheDocument();
    expect(screen.getByText('Keyword search only: embeddings are not configured.')).toBeInTheDocument();
  });

  it('KW4 Embed now posts and reports the count', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    const overview = {
      users: 2,
      sources: 1,
      publishedVersions: 1,
      drafts: 0,
      chunksWithoutEmbedding: 3,
      embeddingsEnabled: true,
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url === '/api/admin/kb/embed-missing') {
        return jsonResponse(200, { embedded: 3, remaining: 0 });
      }
      return jsonResponse(200, overview);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/admin', '/admin', <AdminHome />);
    await user.click(await screen.findByRole('button', { name: 'Embed now' }));
    expect(await screen.findByText('Embedded 3 sections. 0 left.')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/admin/kb/embed-missing');
  });

  it('KW5 uploads a file with its name in X-Filename', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(admin);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse(201, { detail: { version: { id: 'v1' } } });
      return jsonResponse(200, { source: kbSource, versions: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/kb/new?source=s1']}>
        <Routes>
          <Route path="/admin/kb/new" element={<AdminKbNew />} />
          <Route path="/admin/kb/versions/:id" element={<p>version page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Test Act');
    await user.click(screen.getByRole('tab', { name: 'Upload file' }));
    await user.upload(screen.getByLabelText(/^File/), new File(['x'], 'Act 2026.pdf', { type: 'application/pdf' }));
    await user.type(screen.getByLabelText(/Version label/), 'Upload 1');
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('version page')).toBeInTheDocument();
    const upload = fetchMock.mock.calls.find(([url]) => String(url).includes('/versions/upload?'));
    expect(upload?.[0]).toMatch(/^\/api\/admin\/kb\/sources\/s1\/versions\/upload\?/);
    expect(upload?.[1]?.headers).toMatchObject({ 'X-Filename': 'Act%202026.pdf' });
  });
});
