import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/client';
import { call, createFirm, setActive, signUp } from './helpers';
import { stopApp } from './server';

afterAll(async () => {
  await stopApp();
  await pool.end();
});

const slug = () => `ws-${randomUUID().slice(0, 8)}`;
const profile = { jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 };

interface Org {
  id: string;
  kind: string;
}

describe('workspaces', () => {
  it('creating a workspace without a kind → 400', async () => {
    const { cookie } = await signUp();
    const res = await call('POST', '/api/auth/organization/create', { cookie, body: { name: 'No Kind', slug: slug() } });
    expect(res.status).toBe(400);
  });

  it('creating a workspace with an unknown kind → 400', async () => {
    const { cookie } = await signUp();
    const res = await call('POST', '/api/auth/organization/create', {
      cookie,
      body: { name: 'Shop', slug: slug(), kind: 'shop' },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toBe('Workspace kind must be business or practice');
  });

  it('get-full-organization returns the kind', async () => {
    const { cookie } = await signUp();
    const firm = await createFirm(cookie, 'Biz', 'business');
    const res = await call('GET', '/api/auth/organization/get-full-organization', { cookie: firm.cookie });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Org).kind).toBe('business');
  });

  it('organization/list returns every workspace with its kind', async () => {
    const { cookie } = await signUp();
    const biz = await createFirm(cookie, 'Biz', 'business');
    const prac = await createFirm(biz.cookie, 'Prac', 'practice');
    const res = await call('GET', '/api/auth/organization/list', { cookie: prac.cookie });
    const list = (await res.json()) as Org[];
    expect(list.find((o) => o.id === biz.orgId)?.kind).toBe('business');
    expect(list.find((o) => o.id === prac.orgId)?.kind).toBe('practice');
  });

  it('the kind cannot be changed → 400', async () => {
    const { cookie } = await signUp();
    const firm = await createFirm(cookie, 'Prac', 'practice');
    const res = await call('POST', '/api/auth/organization/update', {
      cookie: firm.cookie,
      body: { organizationId: firm.orgId, data: { kind: 'business' } },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toBe('A workspace kind cannot be changed');
    const full = await call('GET', '/api/auth/organization/get-full-organization', { cookie: firm.cookie });
    expect(((await full.json()) as Org).kind).toBe('practice');
  });

  async function business(): Promise<string> {
    const { cookie } = await signUp();
    return (await createFirm(cookie, "Ann's Cafe", 'business')).cookie;
  }

  it('a business: the first client is the entity itself → 201', async () => {
    const cookie = await business();
    const res = await call('POST', '/api/clients', { cookie, body: { name: "Ann's Cafe", ...profile } });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { client: { isSelf: boolean } }).client.isSelf).toBe(true);
  });

  it('a business: a second client → 409', async () => {
    const cookie = await business();
    await call('POST', '/api/clients', { cookie, body: { name: "Ann's Cafe", ...profile } });
    const res = await call('POST', '/api/clients', { cookie, body: { name: 'Second', ...profile } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'This business is already set up' });
  });

  it('a business: the entity cannot be deleted → 403', async () => {
    const cookie = await business();
    const created = await call('POST', '/api/clients', { cookie, body: { name: "Ann's Cafe", ...profile } });
    const { client } = (await created.json()) as { client: { id: string } };
    const del = await call('DELETE', `/api/clients/${client.id}`, { cookie });
    expect(del.status).toBe(403);
    expect(await del.json()).toEqual({ error: 'The business entity cannot be deleted' });
    const got = await call('GET', `/api/clients/${client.id}`, { cookie });
    expect(got.status).toBe(200);
  });

  it('a business: the entity can be edited → 200', async () => {
    const cookie = await business();
    const created = await call('POST', '/api/clients', { cookie, body: { name: "Ann's Cafe", ...profile } });
    const { client } = (await created.json()) as { client: { id: string } };
    const res = await call('PATCH', `/api/clients/${client.id}`, {
      cookie,
      body: { taxRegistered: true, taxPeriod: 'quarterly' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { client: { taxRegistered: boolean; taxPeriod: string } };
    expect(body.client.taxRegistered).toBe(true);
    expect(body.client.taxPeriod).toBe('quarterly');
  });

  it('a practice: clients are never self, even if the body says so', async () => {
    const { cookie } = await signUp();
    const firm = await createFirm(cookie, 'Prac', 'practice');
    const first = await call('POST', '/api/clients', {
      cookie: firm.cookie,
      body: { name: 'One', ...profile, isSelf: true },
    });
    expect(first.status).toBe(201);
    expect(((await first.json()) as { client: { isSelf: boolean } }).client.isSelf).toBe(false);
    const second = await call('POST', '/api/clients', { cookie: firm.cookie, body: { name: 'Two', ...profile } });
    expect(second.status).toBe(201);
  });

  it('switching workspace switches the client list', async () => {
    const { cookie } = await signUp();
    const b = await createFirm(cookie, "Ann's Cafe", 'business');
    await call('POST', '/api/clients', { cookie: b.cookie, body: { name: "Ann's Cafe", ...profile } });
    const p = await createFirm(b.cookie, 'Prac', 'practice');
    await call('POST', '/api/clients', { cookie: p.cookie, body: { name: 'Zed Pty Ltd', ...profile } });

    const names = async (c: string) => {
      const res = await call('GET', '/api/clients', { cookie: c });
      return ((await res.json()) as { clients: { name: string }[] }).clients.map((x) => x.name);
    };
    const onB = await setActive(p.cookie, b.orgId);
    expect(await names(onB)).toEqual(["Ann's Cafe"]);
    const onP = await setActive(onB, p.orgId);
    expect(await names(onP)).toEqual(['Zed Pty Ltd']);
  });
});
