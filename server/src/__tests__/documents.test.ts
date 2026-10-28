import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth } from '../auth';
import { pool } from '../db/client';
import { call, createFirm, mergeCookies, signUp, ORIGIN } from './helpers';
import { startApp, stopApp } from './server';
import { testEnv } from './testEnv';

interface DocBody {
  document: { id: string; kind: string; originalName: string; byteSize: number; truncated: boolean };
}

const fixtureBytes = (name: string): Buffer => readFileSync(join(__dirname, 'fixtures', 'documents', name));

let cookieA = '';
let cookieB = '';
let memberCookie = '';
let entityId = '';
let otherEntityId = '';
let csvDocId = '';

async function makeClient(name: string): Promise<string> {
  const res = await call('POST', '/api/clients', {
    cookie: cookieA,
    body: { name, jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 },
  });
  if (res.status !== 201) throw new Error(`create client failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { client: { id: string } }).client.id;
}

async function upload(cookie: string, clientId: string, name: string, bytes: Uint8Array): Promise<Response> {
  return fetch(`${await startApp()}/api/clients/${clientId}/documents`, {
    method: 'POST',
    headers: { origin: ORIGIN, cookie, 'x-filename': encodeURIComponent(name), 'content-type': 'application/octet-stream' },
    body: bytes,
  });
}

async function ownerQuery(sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
  try {
    return await adminPool.query(sql, params);
  } finally {
    await adminPool.end();
  }
}

beforeAll(async () => {
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Docs Firm A');
  cookieA = firmA.cookie;
  const b = await signUp();
  cookieB = (await createFirm(b.cookie, 'Docs Firm B')).cookie;
  entityId = await makeClient('Docs Entity');
  otherEntityId = await makeClient('Docs Other Entity');

  const m = await signUp();
  await auth.api.addMember({ body: { userId: m.userId, organizationId: firmA.orgId, role: 'member' } });
  const active = await call('POST', '/api/auth/organization/set-active', {
    cookie: m.cookie,
    body: { organizationId: firmA.orgId },
  });
  if (active.status !== 200) throw new Error(`member set-active failed: ${active.status}`);
  memberCookie = mergeCookies(m.cookie, active);
}, 60_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('documents', () => {
  it('DO1 upload a csv', async () => {
    const res = await upload(cookieA, entityId, 'sample.csv', fixtureBytes('sample.csv'));
    expect(res.status).toBe(201);
    const body = (await res.json()) as DocBody;
    expect(body.document.kind).toBe('csv');
    csvDocId = body.document.id;
  });

  it('DO2 list shows it', async () => {
    const res = await call('GET', `/api/clients/${entityId}/documents`, { cookie: cookieA });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { documents: { id: string }[] };
    expect(body.documents.map((d) => d.id)).toContain(csvDocId);
    const json = JSON.stringify(body);
    for (const key of ['fileEnc', 'textEnc', 'file_enc', 'text_enc']) expect(json).not.toContain(key);
  });

  it('DO3 download returns identical bytes and the safe headers', async () => {
    const res = await call('GET', `/api/clients/${entityId}/documents/${csvDocId}/file`, { cookie: cookieA });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="document"; filename*=UTF-8''sample.csv`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await res.arrayBuffer()).equals(fixtureBytes('sample.csv'))).toBe(true);
  });

  it('DO4 the same file again', async () => {
    const res = await upload(cookieA, entityId, 'sample.csv', fixtureBytes('sample.csv'));
    expect(res.status).toBe(200);
    expect(((await res.json()) as DocBody).document.id).toBe(csvDocId);
  });

  it('DO5 an xlsx fixture', async () => {
    const res = await upload(cookieA, entityId, 'two-sheets.xlsx', fixtureBytes('two-sheets.xlsx'));
    expect(res.status).toBe(201);
    expect(((await res.json()) as DocBody).document.kind).toBe('xlsx');
  });

  it('DO15 a real pdf uploads (the body arrives as a Buffer)', async () => {
    const res = await upload(cookieA, entityId, 'sample.pdf', fixtureBytes('sample.pdf'));
    expect(res.status).toBe(201);
    expect(((await res.json()) as DocBody).document.kind).toBe('pdf');
  });

  it('DO6 a .exe name', async () => {
    const res = await upload(cookieA, entityId, 'run.exe', Buffer.from('MZ'));
    expect(res.status).toBe(415);
  });

  it('DO7 a .pdf containing text', async () => {
    const res = await upload(cookieA, entityId, 'fake.pdf', fixtureBytes('sample.txt'));
    expect(res.status).toBe(415);
  });

  it('DO8 a 21 MB body', async () => {
    const res = await upload(cookieA, entityId, 'big.txt', Buffer.alloc(21 * 1024 * 1024, 97));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'Files can be up to 20 MB' });
  });

  it('DO9 an empty body', async () => {
    const res = await upload(cookieA, entityId, 'empty.txt', new Uint8Array(0));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Empty file' });
  });

  it('DO10 the stored bytea holds no plaintext', async () => {
    const row = await ownerQuery('select file_enc, text_enc from document where id = $1', [csvDocId]);
    const fileEnc = row.rows[0].file_enc as Buffer;
    const textEnc = row.rows[0].text_enc as Buffer;
    expect(fileEnc.includes('Sales')).toBe(false);
    expect(textEnc.includes('Sales')).toBe(false);
  });

  it('DO11 a member cannot delete', async () => {
    const res = await call('DELETE', `/api/clients/${entityId}/documents/${csvDocId}`, { cookie: memberCookie });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Only firm owners and admins can delete documents' });
  });

  it('DO12 an admin deletes', async () => {
    const up = await upload(cookieA, otherEntityId, 'sample.txt', fixtureBytes('sample.txt'));
    expect(up.status).toBe(201);
    const id = ((await up.json()) as DocBody).document.id;
    const del = await call('DELETE', `/api/clients/${otherEntityId}/documents/${id}`, { cookie: cookieA });
    expect(del.status).toBe(204);
    const list = await call('GET', `/api/clients/${otherEntityId}/documents`, { cookie: cookieA });
    expect(((await list.json()) as { documents: unknown[] }).documents).toEqual([]);
  });

  it("DO13 firm B gets 404 on list, upload, download and delete of firm A's entity", async () => {
    const list = await call('GET', `/api/clients/${entityId}/documents`, { cookie: cookieB });
    expect(list.status).toBe(404);
    const up = await upload(cookieB, entityId, 'sample.csv', fixtureBytes('sample.csv'));
    expect(up.status).toBe(404);
    const down = await call('GET', `/api/clients/${entityId}/documents/${csvDocId}/file`, { cookie: cookieB });
    expect(down.status).toBe(404);
    const del = await call('DELETE', `/api/clients/${entityId}/documents/${csvDocId}`, { cookie: cookieB });
    expect(del.status).toBe(404);
  });

  it('DO14 an unknown document id', async () => {
    const res = await call('DELETE', `/api/clients/${entityId}/documents/00000000-0000-4000-8000-000000000000`, { cookie: cookieA });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Document not found' });
  });
});
