import { randomUUID } from 'node:crypto';
import { LEGAL_VERSION } from '@chub/shared/lib/legal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { pool } from '../db/client';
import { setTransportForTests, type TestTransport } from '../mail/mailer';
import { invitation, verifyEmail } from '../mail/templates';
import { call, createFirm, mergeCookies, signUp } from './helpers';
import { startApp, stopApp } from './server';

const RESET_LINK = /\/api\/auth\/reset-password\/([^?\s]+)\?callbackURL=/;
const REDIRECT_TO = 'http://localhost:5190/reset-password';

let outbox: TestTransport;

beforeAll(async () => {
  await startApp();
});
afterAll(async () => {
  await stopApp();
  await pool.end();
});
beforeEach(() => {
  outbox = { sent: [] };
  setTransportForTests(outbox);
});
afterEach(() => {
  setTransportForTests(null);
});

async function requestReset(email: string): Promise<Response> {
  return call('POST', '/api/auth/request-password-reset', { body: { email, redirectTo: REDIRECT_TO } });
}

describe('email', () => {
  it('EM1 password reset sends one mail with a link', async () => {
    const u = await signUp();
    const res = await requestReset(u.email);
    expect(res.status).toBe(200);
    expect(outbox.sent.length).toBe(1);
    const sent = outbox.sent[0]!;
    expect(sent.template).toBe('reset');
    expect(sent.to).toBe(u.email);
    expect(sent.text).toMatch(RESET_LINK);
    expect(sent.text).toContain('callbackURL=http%3A%2F%2Flocalhost%3A5190%2Freset-password');
  });

  it('EM2 the emailed token resets the password', async () => {
    const u = await signUp();
    expect((await requestReset(u.email)).status).toBe(200);
    const token = RESET_LINK.exec(outbox.sent[0]!.text)?.[1];
    expect(token).toBeTruthy();
    const reset = await call('POST', '/api/auth/reset-password', { body: { newPassword: 'another-horse-9', token } });
    expect(reset.status).toBe(200);
    const fresh = await call('POST', '/api/auth/sign-in/email', { body: { email: u.email, password: 'another-horse-9' } });
    expect(fresh.status).toBe(200);
    const old = await call('POST', '/api/auth/sign-in/email', { body: { email: u.email, password: 'correct-horse-9' } });
    expect(old.status).toBe(401);
  });

  it('EM3 an unknown email sends nothing and still answers 200', async () => {
    const res = await requestReset(`nobody-${randomUUID()}@example.test`);
    expect(res.status).toBe(200);
    expect(outbox.sent.length).toBe(0);
  });

  it('EM4 an owner invites and the invitee gets a mail', async () => {
    const owner = await signUp();
    const firm = await createFirm(owner.cookie, 'Email Firm');
    const inviteeEmail = `invitee-${randomUUID()}@example.test`;
    const res = await call('POST', '/api/auth/organization/invite-member', {
      cookie: firm.cookie,
      body: { email: inviteeEmail, role: 'member' },
    });
    expect(res.status).toBe(200);
    expect(outbox.sent.length).toBe(1);
    const sent = outbox.sent[0]!;
    expect(sent.template).toBe('invite');
    expect(sent.to).toBe(inviteeEmail);
    expect(sent.subject).toBe('Test User invited you to Email Firm on Compliance Hub');
    expect(sent.text).toContain('http://localhost:5190/accept-invitation/');
  });

  it('EM5 a member cannot invite', async () => {
    const owner = await signUp();
    const firm = await createFirm(owner.cookie, 'Email Firm 5');
    const m = await signUp();
    await auth.api.addMember({ body: { userId: m.userId, organizationId: firm.orgId, role: 'member' } });
    const active = await call('POST', '/api/auth/organization/set-active', {
      cookie: m.cookie,
      body: { organizationId: firm.orgId },
    });
    expect(active.status).toBe(200);
    const res = await call('POST', '/api/auth/organization/invite-member', {
      cookie: mergeCookies(m.cookie, active),
      body: { email: `x-${randomUUID()}@example.test`, role: 'member' },
    });
    expect(res.status).toBe(403);
    expect(outbox.sent.length).toBe(0);
  });

  it('EM6 accepting adds the member', async () => {
    const owner = await signUp();
    const firm = await createFirm(owner.cookie, 'Email Firm 6');
    const inviteeEmail = `invitee-${randomUUID()}@example.test`;
    const invited = await call('POST', '/api/auth/organization/invite-member', {
      cookie: firm.cookie,
      body: { email: inviteeEmail, role: 'member' },
    });
    expect(invited.status).toBe(200);
    const invitationId = /\/accept-invitation\/([^\s]+)/.exec(outbox.sent[0]!.text)?.[1];
    expect(invitationId).toBeTruthy();

    const signedUp = await call('POST', '/api/auth/sign-up/email', {
      body: { name: 'Test User', email: inviteeEmail, password: 'correct-horse-9', termsVersion: LEGAL_VERSION },
    });
    expect(signedUp.status).toBe(200);
    const accepted = await call('POST', '/api/auth/organization/accept-invitation', {
      cookie: mergeCookies('', signedUp),
      body: { invitationId },
    });
    expect(accepted.status).toBe(200);

    const list = await call('GET', `/api/auth/organization/list-members?organizationId=${firm.orgId}`, { cookie: firm.cookie });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { members: { user: { email: string } }[] };
    expect(body.members.some((m) => m.user.email === inviteeEmail)).toBe(true);
  });

  it('EM7 the templates carry the link', () => {
    const v = verifyEmail('http://x.test/v?token=abc');
    expect(v.subject).toBe('Confirm your email for Compliance Hub');
    expect(v.template).toBe('verify');
    expect(v.text).toContain('http://x.test/v?token=abc');
    expect(invitation('Acme', 'Ann', 'http://x.test/i').subject).toBe('Ann invited you to Acme on Compliance Hub');
  });

  it('EM8 mail logs never include the link', async () => {
    const u = await signUp();
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      expect((await requestReset(u.email)).status).toBe(200);
      expect(outbox.sent.length).toBe(1);
      const mailLogs = spy.mock.calls.filter((args) => args[0] === 'mail');
      expect(mailLogs.length).toBeGreaterThan(0);
      for (const args of spy.mock.calls) {
        for (const a of args) {
          const s = JSON.stringify(a);
          expect(s).not.toContain('token');
          expect(s).not.toContain('http');
          expect(s).not.toContain('@');
        }
      }
    } finally {
      spy.mockRestore();
    }
  });
});
