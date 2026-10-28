import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderAt } from './render';
import { SignIn } from '../pages/auth/SignIn';
import { SignUp } from '../pages/auth/SignUp';
import { WorkspaceSetup } from '../pages/workspace/WorkspaceSetup';
import { WorkspaceHome } from '../pages/workspace/WorkspaceHome';
import { EntityDashboard } from '../pages/entity/EntityDashboard';
import { EntitySettings } from '../pages/entity/EntitySettings';
import * as session from '../lib/session';

const signedIn = {
  session: { userId: 'u1', email: 'a@firm.test', name: 'A', activeFirmId: 'org1', activeFirmName: 'Firm A', activeWorkspaceKind: 'practice' as const },
  pending: false,
};
const signedInBusiness = {
  session: { userId: 'u1', email: 'a@firm.test', name: 'A', activeFirmId: 'org2', activeFirmName: "Ann's Cafe", activeWorkspaceKind: 'business' as const },
  pending: false,
};
const noWorkspace = {
  session: { userId: 'u1', email: 'ann@x.test', name: 'Ann Lee', activeFirmId: null, activeFirmName: null, activeWorkspaceKind: null },
  pending: false,
};
const signedOut = { session: null, pending: false };

const acmeClient = {
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
};

const selfClient = {
  id: 'b1',
  name: "Ann's Cafe",
  jurisdiction: 'AU',
  notes: '',
  entities: [],
  isSelf: true,
  entityType: 'trust',
  taxRegistered: true,
  taxPeriod: 'quarterly',
  fyEndMonth: 6,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  // Call history only: the mocked implementations from setup.ts stay in place.
  vi.clearAllMocks();
});

describe('SignIn', () => {
  it('shows the server error', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    vi.mocked(session.signInEmail).mockResolvedValueOnce('Invalid email or password');
    const user = userEvent.setup();
    renderAt('/sign-in', '/sign-in', <SignIn />);
    await user.type(screen.getByLabelText('Email'), 'a@firm.test');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('sends the email and password', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    const user = userEvent.setup();
    renderAt('/sign-in', '/sign-in', <SignIn />);
    await user.type(screen.getByLabelText('Email'), 'a@firm.test');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(session.signInEmail).toHaveBeenCalledWith('a@firm.test', 'password123');
  });

  it('goes to the workspace after signing in', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sign-in']}>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/workspace" element={<p>workspace page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText('Email'), 'a@firm.test');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('workspace page')).toBeInTheDocument();
  });
});

describe('SignUp', () => {
  it('sends name, email and password', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    const user = userEvent.setup();
    renderAt('/sign-up', '/sign-up', <SignUp />);
    await user.type(screen.getByLabelText('Your name'), 'Ann Lee');
    await user.type(screen.getByLabelText('Email'), 'ann@firm.test');
    // The password label also carries its hint text, so match its start.
    await user.type(screen.getByLabelText(/^Password/), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(session.signUpEmail).toHaveBeenCalledWith('Ann Lee', 'ann@firm.test', 'password123');
  });

  it('goes to the workspace after signing up', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sign-up']}>
        <Routes>
          <Route path="/sign-up" element={<SignUp />} />
          <Route path="/workspace" element={<p>workspace page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText('Your name'), 'Ann Lee');
    await user.type(screen.getByLabelText('Email'), 'ann@firm.test');
    await user.type(screen.getByLabelText(/^Password/), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('workspace page')).toBeInTheDocument();
  });
});

describe('WorkspaceSetup', () => {
  it('creates a practice and goes to the workspace', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/workspace/new']}>
        <Routes>
          <Route path="/workspace/new" element={<WorkspaceSetup />} />
          <Route path="/workspace" element={<p>workspace page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByLabelText('An accounting or bookkeeping practice'));
    await user.type(screen.getByLabelText('Practice name'), 'Lee & Co');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(session.createWorkspace).toHaveBeenCalledWith('Lee & Co', 'practice');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText('workspace page')).toBeInTheDocument();
  });

  it('creates a business with its profile', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(201, { client: { id: 'b1' } }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/workspace/new']}>
        <Routes>
          <Route path="/workspace/new" element={<WorkspaceSetup />} />
          <Route path="/entities/:id" element={<p>entity page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText('Business name'), "Ann's Cafe");
    await user.selectOptions(screen.getByLabelText('Jurisdiction'), 'UK');
    await user.click(screen.getByLabelText('Registered for VAT'));
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(session.createWorkspace).toHaveBeenCalledWith("Ann's Cafe", 'business');
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/clients');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Ann's Cafe",
      notes: '',
      jurisdiction: 'UK',
      entityType: 'company',
      taxRegistered: true,
      taxPeriod: 'quarterly',
      fyEndMonth: 6,
    });
    expect(await screen.findByText('entity page')).toBeInTheDocument();
  });

  it('shows the server error', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    vi.mocked(session.createWorkspace).mockResolvedValueOnce('Slug taken');
    const user = userEvent.setup();
    renderAt('/workspace/new', '/workspace/new', <WorkspaceSetup />);
    await user.type(screen.getByLabelText('Business name'), "Ann's Cafe");
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Slug taken');
  });

  it('preselects a practice from the link', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    renderAt('/workspace/new?kind=practice', '/workspace/new', <WorkspaceSetup />);
    expect(screen.getByLabelText('Practice name')).toBeInTheDocument();
  });
});

describe('WorkspaceHome', () => {
  it('asks a signed-out user to sign in', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    renderAt('/workspace', '/workspace', <WorkspaceHome />);
    expect(screen.getByText('Sign in to see your workspace.')).toBeInTheDocument();
  });

  it('greets a new user and offers both kinds of workspace', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(noWorkspace);
    renderAt('/workspace', '/workspace', <WorkspaceHome />);
    expect(screen.getByRole('heading', { name: 'Welcome, Ann' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My own business/ })).toHaveAttribute('href', '/workspace/new?kind=business');
    expect(screen.getByRole('link', { name: /An accounting or bookkeeping practice/ })).toHaveAttribute(
      'href',
      '/workspace/new?kind=practice',
    );
  });

  it("shows the practice's clients as tiles", async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { clients: [acmeClient] })));
    renderAt('/workspace', '/workspace', <WorkspaceHome />);
    expect(await screen.findByRole('link', { name: /Acme Pty Ltd/ })).toHaveAttribute('href', '/entities/c1');
    expect(screen.getByText('Company · Year ends June')).toBeInTheDocument();
  });

  it('adds a client', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { clients: [] }))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          client: {
            id: 'c2',
            name: 'Beta Ltd',
            jurisdiction: 'UK',
            notes: '',
            entities: [],
            isSelf: false,
            entityType: 'company',
            taxRegistered: false,
            taxPeriod: null,
            fyEndMonth: 6,
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/workspace', '/workspace', <WorkspaceHome />);
    // The tiles load first, so wait for the "New client" tile before opening the form.
    await user.click(await screen.findByRole('button', { name: 'New client' }));
    await user.type(screen.getByLabelText('Client name'), 'Beta Ltd');
    await user.selectOptions(screen.getByLabelText('Jurisdiction'), 'UK');
    await user.click(screen.getByRole('button', { name: 'Add client' }));
    expect(await screen.findByText('Beta Ltd')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe('/api/clients');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Beta Ltd',
      notes: '',
      jurisdiction: 'UK',
      entityType: 'company',
      taxRegistered: false,
      taxPeriod: null,
      fyEndMonth: 6,
    });
  });

  it('offers setup when the business has no entity yet', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedInBusiness);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { clients: [] })));
    renderAt('/workspace', '/workspace', <WorkspaceHome />);
    expect(await screen.findByRole('heading', { name: 'Set up your business' })).toBeInTheDocument();
    expect(screen.getByLabelText('Business name')).toHaveValue("Ann's Cafe");
  });
});

describe('EntityDashboard', () => {
  it('shows the entity and remembers it as the active entity', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { client: acmeClient })));
    renderAt('/entities/c1', '/entities/:id', <EntityDashboard />);
    expect(await screen.findByRole('heading', { name: 'Acme Pty Ltd' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ask anything about Acme Pty Ltd' })).toBeInTheDocument();
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rch.entity') ?? 'null')).toEqual({
        workspaceId: 'org1',
        id: 'c1',
        name: 'Acme Pty Ltd',
        jurisdiction: 'AU',
      }),
    );
  });

  it('the entity chat lists chats for this client', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/clients/c1') return jsonResponse(200, { client: acmeClient });
      if (input === '/api/chat/status') {
        return jsonResponse(200, { configured: true, provider: 'stub', model: 'stub-model', embeddings: false });
      }
      if (input === '/api/conversations?clientId=c1') return jsonResponse(200, { conversations: [] });
      return jsonResponse(404, { error: 'Not stubbed' });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/entities/c1', '/entities/:id', <EntityDashboard />);
    await screen.findByRole('heading', { name: 'Acme Pty Ltd' });
    await waitFor(() => expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/conversations?clientId=c1'));
  });

  it('shows not found', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: 'Client not found' })));
    renderAt('/entities/c1', '/entities/:id', <EntityDashboard />);
    expect(await screen.findByText('Client not found.')).toBeInTheDocument();
  });
});

describe('EntitySettings', () => {
  it('shows not found', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: 'Client not found' })));
    renderAt('/entities/c1/settings', '/entities/:id/settings', <EntitySettings />);
    expect(await screen.findByText('Client not found.')).toBeInTheDocument();
  });

  it('hides delete for the business entity', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedInBusiness);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { client: { ...acmeClient, name: "Ann's Cafe", isSelf: true } })));
    renderAt('/entities/c1/settings', '/entities/:id/settings', <EntitySettings />);
    expect(await screen.findByRole('heading', { name: "Ann's Cafe: details" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete client' })).not.toBeInTheDocument();
  });

  it('deletes after confirming', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    localStorage.setItem('rch.entity', JSON.stringify({ workspaceId: 'org1', id: 'c1', name: 'Acme Pty Ltd', jurisdiction: 'AU' }));
    vi.stubGlobal('confirm', vi.fn(() => true));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { client: acmeClient }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/entities/c1/settings', '/entities/:id/settings', <EntitySettings />);
    await user.click(await screen.findByRole('button', { name: 'Delete client' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe('/api/clients/c1');
    expect(init).toMatchObject({ method: 'DELETE' });
    await waitFor(() => expect(localStorage.getItem('rch.entity')).toBeNull());
  });

  it('shows the entity and saves edits', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedInBusiness);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { client: selfClient }))
      .mockResolvedValueOnce(jsonResponse(200, { client: selfClient }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/entities/b1/settings', '/entities/:id/settings', <EntitySettings />);
    expect(await screen.findByRole('heading', { name: "Ann's Cafe: details" })).toBeInTheDocument();
    expect(screen.getByText('Trust · GST quarterly · Year ends June')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe('/api/clients/b1');
    expect(init).toMatchObject({ method: 'PATCH' });
  });
});
