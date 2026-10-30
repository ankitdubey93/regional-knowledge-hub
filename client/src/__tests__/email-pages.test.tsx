import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderAt } from './render';
import { ForgotPassword } from '../pages/auth/ForgotPassword';
import { ResetPassword } from '../pages/auth/ResetPassword';
import { CheckEmail } from '../pages/auth/CheckEmail';
import { SignIn } from '../pages/auth/SignIn';
import { SignUp } from '../pages/auth/SignUp';
import { AcceptInvitation } from '../pages/auth/AcceptInvitation';
import { Members } from '../pages/workspace/Members';
import * as session from '../lib/session';

vi.mock('../lib/deployment', () => ({ useDeployment: vi.fn(() => null) }));

const signedOut = { session: null, pending: false };
const signedIn = {
  session: { userId: 'u1', email: 'a@firm.test', name: 'A', activeFirmId: 'org1', activeFirmName: 'Firm A', activeWorkspaceKind: 'practice' as const },
  pending: false,
};

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

describe('Email pages (P5b)', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('EP-M1 forgot password never says whether the account exists', async () => {
    stubApi({
      'POST /api/auth/request-password-reset': { status: 400, body: { message: 'User not found' } },
    });
    const user = userEvent.setup();
    renderAt('/forgot-password', '/forgot-password', <ForgotPassword />);
    await user.type(screen.getByLabelText('Email'), 'nobody@x.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('If an account uses that address, a reset link is on its way.')).toBeInTheDocument();
    expect(screen.queryByText('User not found')).not.toBeInTheDocument();
  });

  it('EP-M2 the reset page without a token asks for a new link', () => {
    renderAt('/reset-password', '/reset-password', <ResetPassword />);
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toBeInTheDocument();
  });

  it('EP-M3 a reset goes to sign-in with a notice', async () => {
    const fetchMock = stubApi({
      'POST /api/auth/reset-password': ok({ status: true }),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/reset-password?token=abc']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/sign-in" element={<SignIn />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText(/^New password/), 'another-horse-9');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText('Password changed. Sign in with the new one.')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/auth/reset-password');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ newPassword: 'another-horse-9', token: 'abc' });
  });

  it('EP-M4 sign-up that needs confirming goes to check-email', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    vi.mocked(session.signUpEmail).mockResolvedValueOnce({ ok: true, checkEmail: true });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sign-up']}>
        <Routes>
          <Route path="/sign-up" element={<SignUp />} />
          <Route path="/check-email" element={<CheckEmail />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText('Your name'), 'Ann Lee');
    await user.type(screen.getByLabelText('Email'), 'ann@firm.test');
    await user.type(screen.getByLabelText(/^Password/), 'password123');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  });

  it('EP-M5 a member does not see the invite form', async () => {
    stubApi({
      'GET /api/auth/organization/list-members': ok({
        members: [{ id: 'm1', userId: 'u1', role: 'member', user: { name: 'Bo', email: 'b@x.test' } }],
        total: 1,
      }),
      'GET /api/auth/organization/get-active-member-role': ok({ role: 'member' }),
    });
    renderAt('/workspace/members', '/workspace/members', <Members />);
    expect(await screen.findByText('b@x.test')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send invitation' })).not.toBeInTheDocument();
  });

  it('EP-M6 an admin sends an invitation', async () => {
    const fetchMock = stubApi({
      'GET /api/auth/organization/list-members': ok({ members: [], total: 0 }),
      'GET /api/auth/organization/get-active-member-role': ok({ role: 'admin' }),
      'POST /api/auth/organization/invite-member': ok({ id: 'i1' }),
    });
    const user = userEvent.setup();
    renderAt('/workspace/members', '/workspace/members', <Members />);
    const form = await screen.findByRole('form', { name: 'Invite someone' });
    await user.type(within(form).getByLabelText('Email'), 'a@b.test');
    await user.click(within(form).getByRole('button', { name: 'Send invitation' }));
    expect(await screen.findByText('Invitation sent to a@b.test.')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/auth/organization/invite-member');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ email: 'a@b.test', role: 'member' });
  });

  it('EP-M7 the accept page asks a signed-out user to sign in', () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    renderAt('/accept-invitation/i1', '/accept-invitation/:id', <AcceptInvitation />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join workspace' })).not.toBeInTheDocument();
  });

  it('EP-M8 joining switches to the workspace', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    stubApi({
      'POST /api/auth/organization/accept-invitation': ok({ invitation: { id: 'i1' }, member: { organizationId: 'org9' } }),
    });
    const user = userEvent.setup();
    renderAt('/accept-invitation/i1', '/accept-invitation/:id', <AcceptInvitation />);
    await user.click(screen.getByRole('button', { name: 'Join workspace' }));
    await waitFor(() => expect(session.switchWorkspace).toHaveBeenCalledWith('org9'));
  });
});
