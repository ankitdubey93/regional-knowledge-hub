import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db/client';
import { conversation, document, requestLink } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { resealAll } from '../jobs/reseal';
import { aadFor, seal, unseal, type Keyring } from '../privacy/crypto';
import { call, createFirm, ORIGIN, signUp } from './helpers';
import { startApp, stopApp } from './server';
import { testEnv } from './testEnv';

const old = { version: 1, key: Buffer.from(testEnv.DATA_ENCRYPTION_KEY, 'base64') };
const ring2: Keyring = { current: { version: 2, key: Buffer.alloc(32, 9) }, previous: old };

interface Firm { orgId: string; docId: string; clientId: string; userId: string }
const firms: Record<'A' | 'B' | 'C', Firm> = {
  A: { orgId: '', docId: '', clientId: '', userId: '' },
  B: { orgId: '', docId: '', clientId: '', userId: '' },
  C: { orgId: '', docId: '', clientId: '', userId: '' },
};
let convId = '';
let linkId = '';

async function makeFirm(letter: 'A' | 'B' | 'C'): Promise<void> {
  const u = await signUp();
  const f = await createFirm(u.cookie, `Reseal Firm ${letter}`);
  const c = await call('POST', '/api/clients', {
    cookie: f.cookie,
    body: { name: `Reseal Entity ${letter}`, jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 },
  });
  if (c.status !== 201) throw new Error(`create client failed: ${c.status}`);
  const clientId = ((await c.json()) as { client: { id: string } }).client.id;
  const up = await fetch(`${await startApp()}/api/clients/${clientId}/documents`, {
    method: 'POST',
    headers: { origin: ORIGIN, cookie: f.cookie, 'x-filename': encodeURIComponent('reseal.txt'), 'content-type': 'application/octet-stream' },
    body: Buffer.from(`reseal file ${letter}`),
  });
  if (up.status !== 201) throw new Error(`upload failed: ${up.status} ${await up.text()}`);
  const docId = ((await up.json()) as { document: { id: string } }).document.id;
  firms[letter] = { orgId: f.orgId, docId, clientId, userId: u.userId };
}

beforeAll(async () => {
  await makeFirm('A');
  await makeFirm('B');
  await makeFirm('C');
  const a = firms.A;
  convId = randomUUID();
  linkId = randomUUID();
  await withOrg(a.orgId, async (tx) => {
    await tx.insert(conversation).values({
      id: convId,
      orgId: a.orgId,
      clientId: a.clientId,
      userId: a.userId,
      redactionMap: seal(Buffer.from('{"[NAME_1]":"Acme"}'), aadFor('conversation', a.orgId, convId)),
    });
    await tx.insert(requestLink).values({
      id: linkId,
      orgId: a.orgId,
      clientId: a.clientId,
      tokenHash: randomBytes(32),
      tokenEnc: seal(Buffer.from('tok-a'), aadFor('request_link.token', a.orgId, linkId)),
      recipientEmail: 'rs@example.com',
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      createdBy: a.userId,
    });
  });
}, 60_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('reseal', () => {
  it('RS1 every sealed column moves to the new version', async () => {
    const a = firms.A;
    const res = await resealAll(ring2, { orgIds: [a.orgId] });
    expect(res).toEqual({ documents: 1, conversations: 1, requestLinks: 1 });
    await withOrg(a.orgId, async (tx) => {
      const [d] = await tx.select().from(document).where(and(eq(document.id, a.docId), eq(document.orgId, a.orgId)));
      const [c] = await tx.select().from(conversation).where(and(eq(conversation.id, convId), eq(conversation.orgId, a.orgId)));
      const [l] = await tx.select().from(requestLink).where(and(eq(requestLink.id, linkId), eq(requestLink.orgId, a.orgId)));
      expect(d?.fileEnc[0]).toBe(2);
      expect(d?.textEnc[0]).toBe(2);
      expect(c?.redactionMap?.[0]).toBe(2);
      expect(l?.tokenEnc[0]).toBe(2);
      expect(unseal(d!.fileEnc, aadFor('document.file', a.orgId, a.docId), ring2).toString()).toBe('reseal file A');
      expect(unseal(l!.tokenEnc, aadFor('request_link.token', a.orgId, linkId), ring2).toString()).toBe('tok-a');
    });
  });

  it('RS2 a second run changes nothing', async () => {
    const res = await resealAll(ring2, { orgIds: [firms.A.orgId] });
    expect(res).toEqual({ documents: 0, conversations: 0, requestLinks: 0 });
  });

  it('RS3 other firms are untouched', async () => {
    const b = firms.B;
    const [row] = await withOrg(b.orgId, (tx) =>
      tx.select({ f: document.fileEnc }).from(document).where(and(eq(document.id, b.docId), eq(document.orgId, b.orgId))),
    );
    expect(row?.f[0]).toBe(1);
  });

  it('RS4 a row that opens with neither key stops the run', async () => {
    const c = firms.C;
    const bad = seal(Buffer.from('x'), aadFor('document.file', c.orgId, c.docId), { current: { version: 1, key: Buffer.alloc(32, 3) }, previous: null });
    await withOrg(c.orgId, (tx) =>
      tx.update(document).set({ fileEnc: bad }).where(and(eq(document.id, c.docId), eq(document.orgId, c.orgId))),
    );
    await expect(resealAll(ring2, { orgIds: [c.orgId] })).rejects.toThrow(/Cannot open document/);
  });
});
