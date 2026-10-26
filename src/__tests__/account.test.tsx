import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { SignIn } from '../pages/auth/SignIn';
import { SignUp } from '../pages/auth/SignUp';
import { FirmSetup } from '../pages/firm/FirmSetup';
import { Clients } from '../pages/firm/Clients';
import * as session from '../lib/session';

const signedIn = {
  session: { userId: 'u1', email: 'a@firm.test', name: 'A', activeFirmId: 'org1', activeFirmName: 'Firm A' },
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

describe('FirmSetup', () => {
  it('creates the firm by name', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    const user = userEvent.setup();
    renderAt('/firm/new', '/firm/new', <FirmSetup />);
    await user.type(screen.getByLabelText('Firm name'), 'Lee & Co');
    await user.click(screen.getByRole('button', { name: 'Create firm' }));
    expect(session.createFirm).toHaveBeenCalledWith('Lee & Co');
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
          clients: [{ id: 'c1', name: 'Acme Pty Ltd', jurisdiction: 'AU', notes: '', entities: [] }],
        }),
      ),
    );
    renderAt('/clients', '/clients', <Clients />);
    expect(await screen.findByText('Acme Pty Ltd')).toBeInTheDocument();
  });

  it('adds a client', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { clients: [] }))
      .mockResolvedValueOnce(
        jsonResponse(201, { client: { id: 'c2', name: 'Beta Ltd', jurisdiction: 'UK', notes: '', entities: [] } }),
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
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'Beta Ltd', jurisdiction: 'UK' });
  });
});
