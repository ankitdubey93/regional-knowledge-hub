import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db/client';
import { conversation, conversationDocument, document } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { call, createFirm, signUp } from './helpers';
import { stopApp } from './server';

let cookieA = '';
let orgA = '';
let userA = '';
let orgB = '';
let a1 = '';
let a2 = '';
let docA1 = '';
let docA2 = '';
let chatA1 = '';
let hubChat = '';

async function makeClient(name: string): Promise<string> {
  const res = await call('POST', '/api/clients', {
    cookie: cookieA,
    body: { name, jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 },
  });
  if (res.status !== 201) throw new Error(`create client failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { client: { id: string } }).client.id;
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error('expected a returned row');
  return row;
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

function docRow(orgId: string, clientId: string, name: string) {
  return {
    orgId,
    clientId,
    uploadedBy: userA,
    originalName: name,
    kind: 'csv' as const,
    byteSize: 10,
    sha256: randomUUID(),
    textChars: 5,
    fileEnc: Buffer.from([1]),
    textEnc: Buffer.from([1]),
  };
}

beforeAll(async () => {
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Doc Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;
  userA = a.userId;
  const b = await signUp();
  orgB = (await createFirm(b.cookie, 'Doc Firm B')).orgId;
  a1 = await makeClient('Doc Entity One');
  a2 = await makeClient('Doc Entity Two');
  await withOrg(orgA, async (tx) => {
    docA1 = first(await tx.insert(document).values(docRow(orgA, a1, 'one.csv')).returning()).id;
    docA2 = first(await tx.insert(document).values(docRow(orgA, a2, 'two.csv')).returning()).id;
    chatA1 = first(
      await tx.insert(conversation).values({ orgId: orgA, clientId: a1, userId: userA, title: 'x', scope: null }).returning(),
    ).id;
    hubChat = first(
      await tx.insert(conversation).values({ orgId: orgA, clientId: null, userId: userA, title: 'hub', scope: 'AU' }).returning(),
    ).id;
    await tx
      .insert(conversationDocument)
      .values({ orgId: orgA, conversationId: chatA1, clientId: a1, documentId: docA1, attachedBy: userA });
  });
});

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('document tables', () => {
  it('DT1 the bare pool sees no documents', async () => {
    const res = await pool.query('select count(*)::int as n from document');
    expect(res.rows[0].n).toBe(0);
  });

  it("DT2 withOrg(orgB) sees none of firm A's documents or attachments", async () => {
    const docs = await withOrg(orgB, (tx) => tx.select().from(document));
    const links = await withOrg(orgB, (tx) => tx.select().from(conversationDocument));
    expect(docs).toHaveLength(0);
    expect(links).toHaveLength(0);
    const own = await withOrg(orgA, (tx) => tx.select().from(document).where(eq(document.orgId, orgA)));
    expect(own.length).toBeGreaterThanOrEqual(2);
  });

  it("DT3 inserting a document with another firm's org_id fails", async () => {
    const message = await failure(withOrg(orgA, (tx) => tx.insert(document).values(docRow(orgB, a1, 'x.csv'))));
    expect(message).toMatch(/row-level security/);
  });

  it("DT4 attaching entity A2's document to entity A1's chat fails", async () => {
    const message = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(conversationDocument).values({ orgId: orgA, conversationId: chatA1, clientId: a1, documentId: docA2, attachedBy: userA }),
      ),
    );
    expect(message).toMatch(/foreign key/);
  });

  it('DT5 attaching a document to a hub chat fails', async () => {
    const message = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(conversationDocument).values({ orgId: orgA, conversationId: hubChat, clientId: a1, documentId: docA1, attachedBy: userA }),
      ),
    );
    expect(message).toMatch(/foreign key/);
  });

  it('DT6 deleting a document deletes its attachments', async () => {
    const before = await withOrg(orgA, (tx) =>
      tx.select().from(conversationDocument).where(and(eq(conversationDocument.orgId, orgA), eq(conversationDocument.documentId, docA1))),
    );
    expect(before).toHaveLength(1);
    await withOrg(orgA, (tx) => tx.delete(document).where(and(eq(document.id, docA1), eq(document.orgId, orgA))));
    const after = await withOrg(orgA, (tx) =>
      tx.select().from(conversationDocument).where(and(eq(conversationDocument.orgId, orgA), eq(conversationDocument.documentId, docA1))),
    );
    expect(after).toHaveLength(0);
  });
});
