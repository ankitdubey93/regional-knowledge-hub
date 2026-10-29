import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.RATE_LIMITS = 'on';
});

import { setChatProviderForTests } from '../ai/chat';
import { auth } from '../auth';
import { ORIGIN, call, createFirm, mergeCookies, signUp } from './helpers';
import { consume, ipKey } from '../services/rateLimitService';
import { stopApp } from './server';
import { stubProvider } from './stubProvider';
import { testEnv } from './testEnv';

async function ownerQuery(sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
  try {
    return await adminPool.query(sql, params);
  } finally {
    await adminPool.end();
  }
}

async function signIn(email: string, extra: Record<string, string> = {}): Promise<Response> {
  const { startApp } = await import('./server');
  return fetch(`${await startApp()}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...extra },
    body: JSON.stringify({ email, password: 'wrong-password-1' }),
  });
}

beforeEach(async () => {
  await ownerQuery('DELETE FROM rate_bucket');
});

afterAll(async () => {
  setChatProviderForTests(undefined);
  await ownerQuery('DELETE FROM rate_bucket');
  await stopApp();
});

describe('rate_bucket consume', () => {
  const now = new Date('2026-10-29T10:00:00.000Z');

  it('consume allows up to max then refuses with retryAfter', async () => {
    const key = `t:${randomUUID()}`;
    const rule = { window: 60, max: 2 };
    expect((await consume(key, rule, now)).allowed).toBe(true);
    expect((await consume(key, rule, now)).allowed).toBe(true);
    expect(await consume(key, rule, now)).toEqual({ allowed: false, retryAfter: 60 });
  });

  it('consume resets after the window', async () => {
    const key = `t:${randomUUID()}`;
    const rule = { window: 60, max: 2 };
    await consume(key, rule, now);
    await consume(key, rule, now);
    await consume(key, rule, now);
    const later = new Date(now.getTime() + 61_000);
    expect((await consume(key, rule, later)).allowed).toBe(true);
    const row = await ownerQuery('select count from rate_bucket where key = $1', [key]);
    expect(row.rows[0].count).toBe(1);
  });

  it('consume is atomic under concurrency', async () => {
    const key = `t:${randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 20 }, () => consume(key, { window: 60, max: 5 }, now)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it('ipKey never stores the raw ip', () => {
    const k = ipKey('203.0.113.9');
    expect(k).toHaveLength(32);
    expect(k).not.toContain('203');
  });
});

describe('http limits', () => {
  it('sign-in is limited per IP', async () => {
    const u = await signUp();
    await ownerQuery('DELETE FROM rate_bucket');
    for (let i = 0; i < 10; i += 1) expect((await signIn(u.email)).status).toBe(401);
    const res = await signIn(u.email);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).not.toBeNull();
  });

  it('a spoofed x-forwarded-for does not dodge the limit', async () => {
    const u = await signUp();
    await ownerQuery('DELETE FROM rate_bucket');
    for (let i = 0; i < 10; i += 1) expect((await signIn(u.email, { 'x-forwarded-for': `198.51.100.${i + 1}` })).status).toBe(401);
    const res = await signIn(u.email, { 'x-forwarded-for': '198.51.100.200' });
    expect(res.status).toBe(429);
  });

  it('chat messages are limited per user', async () => {
    setChatProviderForTests(stubProvider({ chunks: ['ok'] }));
    const a = await signUp();
    const firm = await createFirm(a.cookie, 'Rate Firm');
    const created = await call('POST', '/api/conversations', { cookie: firm.cookie, body: { clientId: null, scope: 'AU' } });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    for (let i = 0; i < 10; i += 1) {
      const r = await call('POST', `/api/conversations/${id}/messages`, { cookie: firm.cookie, body: { text: 'zxqv blorf wug?' } });
      expect(r.status).not.toBe(429);
      await r.text();
    }
    const over = await call('POST', `/api/conversations/${id}/messages`, { cookie: firm.cookie, body: { text: 'zxqv blorf wug?' } });
    expect(over.status).toBe(429);
    expect(await over.json()).toMatchObject({ error: 'Too many requests. Try again in a moment.' });
  });

  it('limits are per user, not per firm', async () => {
    setChatProviderForTests(stubProvider({ chunks: ['ok'] }));
    const a = await signUp();
    const firm = await createFirm(a.cookie, 'Rate Firm Two');
    const created = await call('POST', '/api/conversations', { cookie: firm.cookie, body: { clientId: null, scope: 'AU' } });
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    for (let i = 0; i < 11; i += 1) await (await call('POST', `/api/conversations/${id}/messages`, { cookie: firm.cookie, body: { text: 'zxqv blorf wug?' } })).text();

    const b = await signUp();
    await auth.api.addMember({ body: { userId: b.userId, organizationId: firm.orgId, role: 'member' } });
    const active = await call('POST', '/api/auth/organization/set-active', { cookie: b.cookie, body: { organizationId: firm.orgId } });
    expect(active.status).toBe(200);
    const firmB = { cookie: mergeCookies(b.cookie, active) };
    const createdB = await call('POST', '/api/conversations', { cookie: firmB.cookie, body: { clientId: null, scope: 'AU' } });
    const idB = ((await createdB.json()) as { conversation: { id: string } }).conversation.id;
    const first = await call('POST', `/api/conversations/${idB}/messages`, { cookie: firmB.cookie, body: { text: 'zxqv blorf wug?' } });
    expect(first.status).not.toBe(429);
    await first.text();
  });
});
