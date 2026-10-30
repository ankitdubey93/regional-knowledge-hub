import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/client';
import { requestLink, requestLinkItem } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { setTransportForTests, type TestTransport } from '../mail/mailer';
import { hashLinkToken, newLinkToken } from '../services/requestLinkService';
import { LINK_TOKEN_PATTERN, type RequestLinkView } from '../types/requestLinks';
import { ORIGIN, call, createFirm, signUp } from './helpers';
import { startApp, stopApp } from './server';

const INVALID = 'This link is not valid or has expired';
const NOT_ON_LINK = 'This item is not on this link';

let cookieA = '';
let cookieB = '';
let orgA = '';
let orgB = '';
let clientA = '';
let clientA2 = '';
let clientB = '';
let reqsA: { id: string; label: string }[] = [];
let reqsA2: { id: string }[] = [];
let reqsB: { id: string }[] = [];
let outbox: TestTransport = { sent: [] };

interface Created {
  link: RequestLinkView;
  url: string;
  emailSent: boolean;
}

async function makeClient(cookie: string, name: string): Promise<string> {
  const res = await call('POST', '/api/clients', {
    cookie,
    body: { name, jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 },
  });
  if (res.status !== 201) throw new Error(`create client failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { client: { id: string } }).client.id;
}

async function makeRequests(cookie: string, clientId: string, n: number, prefix: string): Promise<{ id: string; label: string }[]> {
  const out: { id: string; label: string }[] = [];
  for (let i = 0; i < n; i += 1) {
    const label = `${prefix} item ${String(i).padStart(2, '0')}`;
    const res = await call('POST', `/api/clients/${clientId}/requests`, { cookie, body: { label, dueOn: null } });
    if (res.status !== 201) throw new Error(`create request failed: ${res.status}`);
    out.push({ id: ((await res.json()) as { request: { id: string } }).request.id, label });
  }
  return out;
}

const email = (tag: string) => `rl-${tag}-${randomUUID()}@example.com`;
const linksUrl = (clientId: string, suffix = '') => `/api/clients/${clientId}/request-links${suffix}`;

async function createLinkVia(
  cookie: string,
  clientId: string,
  requestIds: string[],
  extra: Record<string, unknown> = {},
  tag = 'x',
): Promise<{ res: Response; body: Created; recipient: string }> {
  const recipient = email(tag);
  const res = await call('POST', linksUrl(clientId), { cookie, body: { recipientEmail: recipient, requestIds, ...extra } });
  const body = (await res.json()) as Created;
  return { res, body, recipient };
}

const tokenOf = (url: string) => url.slice(url.lastIndexOf('/r/') + 3);

async function publicGet(token: string): Promise<Response> {
  return fetch(`${await startApp()}/api/public/requests/${token}`, { headers: { origin: ORIGIN } });
}

async function publicUpload(token: string, requestId: string, name: string | null, bytes: Uint8Array): Promise<Response> {
  const headers: Record<string, string> = { origin: ORIGIN, 'content-type': 'application/octet-stream' };
  if (name !== null) headers['x-filename'] = encodeURIComponent(name);
  return fetch(`${await startApp()}/api/public/requests/${token}/items/${requestId}/upload`, { method: 'POST', headers, body: bytes });
}

const utf8 = (s: string) => new TextEncoder().encode(s);

async function rows<T>(orgId: string, query: ReturnType<typeof sql>): Promise<T[]> {
  return withOrg(orgId, async (tx) => (await tx.execute(query)).rows as T[]);
}

async function failure(p: Promise<unknown>): Promise<string> {
  const err: unknown = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const cause = (err as Error).cause;
  return cause instanceof Error ? cause.message : (err as Error).message;
}

beforeAll(async () => {
  await startApp();
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Links Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;
  const b = await signUp();
  const firmB = await createFirm(b.cookie, 'Links Firm B');
  cookieB = firmB.cookie;
  orgB = firmB.orgId;
  clientA = await makeClient(cookieA, 'Links A Pty Ltd');
  clientA2 = await makeClient(cookieA, 'Links A2 Pty Ltd');
  clientB = await makeClient(cookieB, 'Links B Pty Ltd');
  reqsA = await makeRequests(cookieA, clientA, 16, 'Secret A');
  reqsA2 = await makeRequests(cookieA, clientA2, 2, 'Secret A2');
  reqsB = await makeRequests(cookieB, clientB, 2, 'Secret B');
}, 60_000);

beforeEach(() => {
  outbox = { sent: [] };
  setTransportForTests(outbox);
});

afterAll(async () => {
  setTransportForTests(null);
  await stopApp();
  await pool.end();
});

describe('request links (staff)', () => {
  let main: Created;
  let mainRecipient = '';

  it('RL1 create sends the link once', async () => {
    const { res, body, recipient } = await createLinkVia(cookieA, clientA, [reqsA[0]!.id, reqsA[1]!.id, reqsA[2]!.id], {}, 'rl1');
    expect(res.status).toBe(201);
    main = body;
    mainRecipient = recipient;
    expect(body.url.startsWith('http://localhost:5190/r/')).toBe(true);
    expect(LINK_TOKEN_PATTERN.test(tokenOf(body.url))).toBe(true);
    expect(body.emailSent).toBe(true);
    const mine = outbox.sent.filter((m) => m.to === recipient);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subject).toBe('Links Firm A has asked you for documents');
    expect(mine[0]!.text).toContain(body.url);
    expect(mine[0]!.text).not.toContain('Secret A');
  });

  it('RL2 only the hash and a sealed copy are stored', async () => {
    const token = tokenOf(main.url);
    const r = await rows<{ same: boolean; found: number }>(
      orgA,
      sql`select (token_hash = ${hashLinkToken(token)}) as same, position(convert_to(${token}, 'UTF8') in token_enc) as found
          from request_link where id = ${main.link.id} and org_id = ${orgA}`,
    );
    expect(r[0]!.same).toBe(true);
    expect(r[0]!.found).toBe(0);
  });

  it('RL3 list shows an active link', async () => {
    const res = await call('GET', linksUrl(clientA), { cookie: cookieA });
    expect(res.status).toBe(200);
    const { links } = (await res.json()) as { links: RequestLinkView[] };
    const found = links.find((l) => l.id === main.link.id);
    expect(found).toMatchObject({ status: 'active', openItems: 3, cadenceDays: [3, 7, 14], nudgeCount: 0, recipientEmail: mainRecipient });
    expect(found!.requestIds).toHaveLength(3);
  });

  it('RL4 only open requests of this entity', async () => {
    const other = await createLinkVia(cookieA, clientA, [reqsA2[0]!.id]);
    expect(other.res.status).toBe(422);
    expect(other.body).toEqual({ error: 'Choose open requests for this entity' });
    const waive = await call('PATCH', `/api/clients/${clientA}/requests/${reqsA[10]!.id}`, { cookie: cookieA, body: { status: 'waived' } });
    expect(waive.status).toBe(200);
    const waived = await createLinkVia(cookieA, clientA, [reqsA[10]!.id]);
    expect(waived.res.status).toBe(422);
    expect(waived.body).toEqual({ error: 'Choose open requests for this entity' });
  });

  it('RL5 bad input is rejected', async () => {
    const id = reqsA[0]!.id;
    const bad: Record<string, unknown>[] = [
      { recipientEmail: 'nope', requestIds: [id] },
      { recipientEmail: email('rl5'), requestIds: [] },
      { recipientEmail: email('rl5'), requestIds: [id], cadenceDays: [7, 3] },
      { recipientEmail: email('rl5'), requestIds: [id], expiresInDays: 5, cadenceDays: [7] },
      { recipientEmail: email('rl5'), requestIds: [id], token: 'x' },
    ];
    for (const body of bad) {
      const res = await call('POST', linksUrl(clientA), { cookie: cookieA, body });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'Invalid input' });
    }
  });

  it('RL6 pause and resume are audited once each', async () => {
    const { body } = await createLinkVia(cookieA, clientA, [reqsA[11]!.id], {}, 'rl6');
    const id = body.link.id;
    const statuses: string[] = [];
    for (const paused of [true, true, false]) {
      const res = await call('PATCH', linksUrl(clientA, `/${id}`), { cookie: cookieA, body: { paused } });
      expect(res.status).toBe(200);
      statuses.push(((await res.json()) as { link: RequestLinkView }).link.status);
    }
    expect(statuses).toEqual(['paused', 'paused', 'active']);
    const ev = await rows<{ action: string }>(orgA, sql`select action from audit_event where org_id = ${orgA} and target_id = ${id} order by id`);
    expect(ev.map((e) => e.action).filter((a) => a !== 'request_link.create')).toEqual(['request_link.pause', 'request_link.resume']);
  });

  it('RL7 revoke', async () => {
    const { body } = await createLinkVia(cookieA, clientA, [reqsA[12]!.id], {}, 'rl7');
    const id = body.link.id;
    expect((await call('DELETE', linksUrl(clientA, `/${id}`), { cookie: cookieA })).status).toBe(204);
    const list = (await (await call('GET', linksUrl(clientA), { cookie: cookieA })).json()) as { links: RequestLinkView[] };
    expect(list.links.find((l) => l.id === id)?.status).toBe('revoked');
    expect((await call('DELETE', linksUrl(clientA, `/${id}`), { cookie: cookieA })).status).toBe(204);
    const ev = await rows<{ n: number }>(
      orgA,
      sql`select count(*)::int as n from audit_event where org_id = ${orgA} and target_id = ${id} and action = 'request_link.revoke'`,
    );
    expect(ev[0]!.n).toBe(1);
    const patch = await call('PATCH', linksUrl(clientA, `/${id}`), { cookie: cookieA, body: { paused: true } });
    expect(patch.status).toBe(409);
    expect(await patch.json()).toEqual({ error: 'This link is revoked' });
  });

  it('RL8 a mail failure still creates the link', async () => {
    setTransportForTests(null);
    const { res, body } = await createLinkVia(cookieA, clientA, [reqsA[13]!.id], {}, 'rl8');
    expect(res.status).toBe(201);
    expect(body.emailSent).toBe(false);
    const list = (await (await call('GET', linksUrl(clientA), { cookie: cookieA })).json()) as { links: RequestLinkView[] };
    expect(list.links.some((l) => l.id === body.link.id)).toBe(true);
  });

  it('RL9 the create event holds no email', async () => {
    const ev = await rows<{ detail: Record<string, unknown> }>(
      orgA,
      sql`select detail from audit_event where org_id = ${orgA} and target_id = ${main.link.id} and action = 'request_link.create'`,
    );
    expect(ev).toHaveLength(1);
    expect(ev[0]!.detail).toEqual({ clientId: clientA, items: 3, expiresInDays: 30 });
    expect(JSON.stringify(ev[0]!.detail)).not.toContain('@');
  });
});

describe('public requests', () => {
  let linkId = '';
  let token = '';
  let firstDocId = '';
  let secondDocId = '';
  let bToken = '';
  let bLinkId = '';
  const p = () => [reqsA[3]!.id, reqsA[4]!.id, reqsA[6]!.id];

  beforeAll(async () => {
    setTransportForTests({ sent: [] });
    const created = await createLinkVia(cookieA, clientA, p(), {}, 'pr');
    linkId = created.body.link.id;
    token = tokenOf(created.body.url);
    const b = await createLinkVia(cookieB, clientB, [reqsB[0]!.id], {}, 'prb');
    bToken = tokenOf(b.body.url);
    bLinkId = b.body.link.id;
  });

  it('PR1 the public view shows labels only', async () => {
    const res = await publicGet(token);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    const { request } = JSON.parse(text) as { request: { firmName: string; expiresOn: string; items: { id: string; label: string; received: boolean }[] } };
    expect(request.firmName).toBe('Links Firm A');
    const row = await rows<{ expires_at: string | Date; recipient_email: string }>(
      orgA,
      sql`select expires_at, recipient_email from request_link where id = ${linkId} and org_id = ${orgA}`,
    );
    expect(request.expiresOn).toBe(new Date(row[0]!.expires_at).toISOString().slice(0, 10));
    const expected = p()
      .map((id) => ({ id, label: reqsA.find((r) => r.id === id)!.label, received: false }))
      .sort((x, y) => x.label.localeCompare(y.label));
    expect(request.items).toEqual(expected);
    expect(text).not.toContain(row[0]!.recipient_email);
    expect(text).not.toContain(clientA);
  });

  it('PR2 a malformed or unknown token gets 404', async () => {
    for (const t of ['abc', newLinkToken().token]) {
      const res = await publicGet(t);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: INVALID });
    }
  });

  it('PR3 an expired link gets 404', async () => {
    const c = await createLinkVia(cookieA, clientA, [reqsA[14]!.id], {}, 'pr3');
    await withOrg(orgA, (tx) => tx.execute(sql`update request_link set expires_at = now() - interval '1 minute' where id = ${c.body.link.id} and org_id = ${orgA}`));
    const res = await publicGet(tokenOf(c.body.url));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: INVALID });
  });

  it('PR4 a revoked link gets 404', async () => {
    const c = await createLinkVia(cookieA, clientA, [reqsA[14]!.id], {}, 'pr4');
    await call('DELETE', linksUrl(clientA, `/${c.body.link.id}`), { cookie: cookieA });
    const res = await publicGet(tokenOf(c.body.url));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: INVALID });
  });

  it('PR5 an upload is sealed and marks the request received', async () => {
    const res = await publicUpload(token, reqsA[3]!.id, 'bank.txt', utf8('hello statement'));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { item: { id: string; received: boolean } };
    expect(body.item).toMatchObject({ id: reqsA[3]!.id, received: true });
    const docs = await rows<{ id: string; uploaded_by: string; request_id: string; request_link_id: string; p: number }>(
      orgA,
      sql`select id, uploaded_by, request_id, request_link_id, position('hello statement'::bytea in file_enc) as p
          from document where org_id = ${orgA} and client_id = ${clientA} and request_id = ${reqsA[3]!.id}`,
    );
    expect(docs).toHaveLength(1);
    firstDocId = docs[0]!.id;
    expect(docs[0]).toMatchObject({ uploaded_by: 'client_link', request_id: reqsA[3]!.id, request_link_id: linkId, p: 0 });
    const status = await rows<{ status: string }>(orgA, sql`select status from document_request where id = ${reqsA[3]!.id} and org_id = ${orgA}`);
    expect(status[0]!.status).toBe('received');
    const ev = await rows<{ actor_id: string | null; detail: { via?: string } }>(
      orgA,
      sql`select actor_id, detail from audit_event where org_id = ${orgA} and action = 'document.upload' and target_id = ${firstDocId}`,
    );
    expect(ev).toHaveLength(1);
    expect(ev[0]!.actor_id).toBeNull();
    expect(ev[0]!.detail.via).toBe('request_link');
  });

  it('PR6 a different file supersedes the first', async () => {
    const res = await publicUpload(token, reqsA[3]!.id, 'bank-v2.txt', utf8('hello statement v2'));
    expect(res.status).toBe(201);
    const docs = await rows<{ id: string; supersedes_id: string | null }>(
      orgA,
      sql`select id, supersedes_id from document where org_id = ${orgA} and request_id = ${reqsA[3]!.id} order by created_at`,
    );
    expect(docs).toHaveLength(2);
    secondDocId = docs[1]!.id;
    expect(docs[0]!.id).toBe(firstDocId);
    expect(docs[1]!.supersedes_id).toBe(firstDocId);
    expect(secondDocId).not.toBe(firstDocId);
  });

  it('PR7 identical bytes store nothing new', async () => {
    const count = () => rows<{ n: number }>(orgA, sql`select count(*)::int as n from document where org_id = ${orgA} and client_id = ${clientA}`);
    const before = (await count())[0]!.n;
    const res = await publicUpload(token, reqsA[3]!.id, 'bank-v2.txt', utf8('hello statement v2'));
    expect(res.status).toBe(200);
    expect((await count())[0]!.n).toBe(before);
  });

  it('PR8 an item not on the link gets 404', async () => {
    const off = await publicUpload(token, reqsA[7]!.id, 'a.txt', utf8('off link'));
    expect(off.status).toBe(404);
    expect(await off.json()).toEqual({ error: NOT_ON_LINK });
    await call('PATCH', `/api/clients/${clientA}/requests/${reqsA[6]!.id}`, { cookie: cookieA, body: { status: 'waived' } });
    const waived = await publicUpload(token, reqsA[6]!.id, 'w.txt', utf8('waived file'));
    expect(waived.status).toBe(404);
    expect(await waived.json()).toEqual({ error: NOT_ON_LINK });
  });

  it("PR9 a firm B token cannot reach firm A's request", async () => {
    const res = await publicUpload(bToken, reqsA[4]!.id, 'x.txt', utf8('cross firm'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: NOT_ON_LINK });
  });

  it('PR10 bad files are refused', async () => {
    const exe = await publicUpload(token, reqsA[4]!.id, 'x.exe', utf8('MZ'));
    expect(exe.status).toBe(415);
    expect(await exe.json()).toEqual({ error: 'Upload a PDF, Word (.docx), Excel (.xlsx), CSV, text or Markdown file' });
    const empty = await publicUpload(token, reqsA[4]!.id, 'e.txt', new Uint8Array(0));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: 'Empty file' });
    const noName = await publicUpload(token, reqsA[4]!.id, null, utf8('data'));
    expect(noName.status).toBe(400);
    expect(await noName.json()).toEqual({ error: 'Missing file name' });
  });

  it('PR11 a revoke stops uploads', async () => {
    expect((await call('DELETE', linksUrl(clientA, `/${linkId}`), { cookie: cookieA })).status).toBe(204);
    const res = await publicUpload(token, reqsA[4]!.id, 'late.txt', utf8('too late'));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: INVALID });
  });

  describe('isolation', () => {
    it('RLI1 the bare pool sees no links', async () => {
      for (const t of ['request_link', 'request_link_item']) {
        const r = await pool.query(`select count(*)::int as n from ${t}`);
        expect(r.rows[0].n).toBe(0);
      }
    });

    it("RLI2 withOrg(orgB) sees none of firm A's links or items", async () => {
      const links = await withOrg(orgB, (tx) => tx.select().from(requestLink).where(sql`${requestLink.id} = ${linkId}`));
      const items = await withOrg(orgB, (tx) => tx.select().from(requestLinkItem).where(sql`${requestLinkItem.linkId} = ${linkId}`));
      expect(links).toHaveLength(0);
      expect(items).toHaveLength(0);
      const own = await withOrg(orgB, (tx) => tx.select().from(requestLink).where(sql`${requestLink.id} = ${bLinkId}`));
      expect(own).toHaveLength(1);
    });

    it("RLI3 a link for another firm's client fails", async () => {
      const msg = await failure(
        withOrg(orgA, (tx) =>
          tx.insert(requestLink).values({
            orgId: orgA,
            clientId: clientB,
            tokenHash: newLinkToken().hash,
            tokenEnc: Buffer.from('x'),
            recipientEmail: 'a@example.com',
            expiresAt: new Date(Date.now() + 86_400_000),
            createdBy: 'u',
          }),
        ),
      );
      expect(msg).toMatch(/request_link_client_org_fk/);
    });

    it("RLI4 an item joining firm A's link to firm B's request fails", async () => {
      const msg = await failure(
        withOrg(orgA, (tx) => tx.insert(requestLinkItem).values({ orgId: orgA, clientId: clientA, linkId, requestId: reqsB[1]!.id })),
      );
      expect(msg).toMatch(/request_link_item_request_fk/);
    });

    it("RLI5 a document pointing at another client's request fails", async () => {
      const msg = await failure(
        withOrg(orgA, (tx) => tx.execute(sql`update document set request_id = ${reqsA2[0]!.id} where id = ${firstDocId} and org_id = ${orgA}`)),
      );
      expect(msg).toMatch(/document_request_fk/);
    });

    it("RLI6 firm B gets 404 on firm A's links", async () => {
      const list = await call('GET', linksUrl(clientA), { cookie: cookieB });
      expect(list.status).toBe(404);
      expect(await list.json()).toEqual({ error: 'Client not found' });
      const patch = await call('PATCH', linksUrl(clientB, `/${linkId}`), { cookie: cookieB, body: { paused: true } });
      expect(patch.status).toBe(404);
      expect(await patch.json()).toEqual({ error: 'Link not found' });
      const del = await call('DELETE', linksUrl(clientB, `/${linkId}`), { cookie: cookieB });
      expect(del.status).toBe(404);
      expect(await del.json()).toEqual({ error: 'Link not found' });
    });

    it('RLI7 deleting a request keeps its document', async () => {
      const del = await call('DELETE', `/api/clients/${clientA}/requests/${reqsA[3]!.id}`, { cookie: cookieA });
      expect(del.status).toBe(204);
      const docs = await rows<{ id: string; request_id: string | null }>(
        orgA,
        sql`select id, request_id from document where org_id = ${orgA} and id in (${firstDocId}, ${secondDocId})`,
      );
      expect(docs).toHaveLength(2);
      expect(docs.every((d) => d.request_id === null)).toBe(true);
    });
  });
});
