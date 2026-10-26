import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderAt } from './render';
import { SignIn } from '../pages/auth/SignIn';
import { SignUp } from '../pages/auth/SignUp';
import { WorkspaceSetup } from '../pages/workspace/WorkspaceSetup';
import { Business } from '../pages/workspace/Business';
import { Clients } from '../pages/firm/Clients';
import { ClientDetail } from '../pages/firm/ClientDetail';
import * as session from '../lib/session';

const signedIn = {
  session: { userId: 'u1', email: 'a@firm.test', name: 'A', activeFirmId: 'org1', activeFirmName: 'Firm A', activeWorkspaceKind: 'practice' as const },
  pending: false,
};
const signedInBusiness = {
  session: { userId: 'u1', email: 'a@firm.test', name: 'A', activeFirmId: 'org2', activeFirmName: "Ann's Cafe", activeWorkspaceKind: 'business' as const },
  pending: false,
};
const signedOut = { session: null, pending: false };

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
});

describe('WorkspaceSetup', () => {
  it('creates a practice and goes to clients', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/workspace/new', '/workspace/new', <WorkspaceSetup />);
    await user.click(screen.getByLabelText('An accounting or bookkeeping practice'));
    await user.type(screen.getByLabelText('Practice name'), 'Lee & Co');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(session.createWorkspace).toHaveBeenCalledWith('Lee & Co', 'practice');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates a business with its profile', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(201, { client: { id: 'b1' } }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/workspace/new', '/workspace/new', <WorkspaceSetup />);
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
});

describe('Clients', () => {
  it('asks a signed-out user to sign in', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    renderAt('/clients', '/clients', <Clients />);
    expect(screen.getByText('Sign in to see your clients.')).toBeInTheDocument();
  });

  it("lists the firm's clients", async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(200, {
          clients: [
            {
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
            },
          ],
        }),
      ),
    );
    renderAt('/clients', '/clients', <Clients />);
    expect(await screen.findByText('Acme Pty Ltd')).toBeInTheDocument();
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
    renderAt('/clients', '/clients', <Clients />);
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

  it('sends a business workspace to /business', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedInBusiness);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { clients: [] })));
    render(
      <MemoryRouter initialEntries={['/clients']}>
        <Routes>
          <Route path="/clients" element={<Clients />} />
          <Route path="/business" element={<p>business page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('business page')).toBeInTheDocument();
  });
});

describe('Business', () => {
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

  it('offers setup when the business has no entity yet', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedInBusiness);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { clients: [] })));
    renderAt('/business', '/business', <Business />);
    expect(await screen.findByRole('heading', { name: 'Set up your business' })).toBeInTheDocument();
    expect(screen.getByLabelText('Business name')).toHaveValue("Ann's Cafe");
  });

  it('shows the entity and saves edits', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedInBusiness);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { clients: [selfClient] }))
      .mockResolvedValueOnce(jsonResponse(200, { client: selfClient }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/business', '/business', <Business />);
    expect(await screen.findByRole('heading', { name: "Ann's Cafe" })).toBeInTheDocument();
    expect(screen.getByText('Trust · GST quarterly · Year ends June')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe('/api/clients/b1');
    expect(init).toMatchObject({ method: 'PATCH' });
  });
});

describe('ClientDetail', () => {
  const client = {
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

  it('shows not found', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: 'Client not found' })));
    renderAt('/clients/c1', '/clients/:id', <ClientDetail />);
    expect(await screen.findByText('Client not found.')).toBeInTheDocument();
  });

  it('hides delete for the business entity', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedInBusiness);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { client: { ...client, name: "Ann's Cafe", isSelf: true } })));
    renderAt('/clients/c1', '/clients/:id', <ClientDetail />);
    expect(await screen.findByRole('heading', { name: "Ann's Cafe" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete client' })).not.toBeInTheDocument();
  });

  it('deletes after confirming', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { client }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAt('/clients/c1', '/clients/:id', <ClientDetail />);
    await user.click(await screen.findByRole('button', { name: 'Delete client' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe('/api/clients/c1');
    expect(init).toMatchObject({ method: 'DELETE' });
  });
});
