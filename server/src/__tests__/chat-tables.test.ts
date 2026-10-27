import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db/client';
import { chatCitation, chatMessage, conversation } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { call, createFirm, signUp } from './helpers';
import { stopApp } from './server';
import { testEnv } from './testEnv';

let cookieA = '';
let orgA = '';
let userA = '';
let orgB = '';
let auId = '';
const usageOrg = `chat-tables-${randomUUID()}`;

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

beforeAll(async () => {
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Chat Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;
  userA = a.userId;
  const b = await signUp();
  const firmB = await createFirm(b.cookie, 'Chat Firm B');
  orgB = firmB.orgId;
  auId = await makeClient('Chat AU Co');
});

afterAll(async () => {
  const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
  try {
    await adminPool.query('delete from ai_usage where org_id = $1', [usageOrg]);
  } finally {
    await adminPool.end();
  }
  await stopApp();
  await pool.end();
});

describe('chat tables', () => {
  it('T1 withOrg(orgA) can insert a conversation, a message and a citation for firm A', async () => {
    await withOrg(orgA, async (tx) => {
      const conv = first(
        await tx.insert(conversation).values({ orgId: orgA, clientId: auId, userId: userA, title: 'x', scope: null }).returning(),
      );
      await tx.insert(chatMessage).values({ orgId: orgA, conversationId: conv.id, role: 'user', status: 'sent', body: 'q', createdBy: userA });
      const answer = first(
        await tx
          .insert(chatMessage)
          .values({ orgId: orgA, conversationId: conv.id, role: 'assistant', status: 'answered', body: 'a [1]', createdBy: userA })
          .returning(),
      );
      await tx.insert(chatCitation).values({
        orgId: orgA,
        messageId: answer.id,
        marker: 1,
        sourceId: randomUUID(),
        versionId: randomUUID(),
        chunkId: randomUUID(),
        title: 'Test source',
        citation: 'Test 2026',
        kind: 'act',
        jurisdiction: 'AU',
        billStatus: null,
        headingPath: ['Part 1', 's 2'],
        provisionRef: 's 2',
        sitePath: null,
        officialUrl: 'https://example.gov.au/x',
        excerpt: 'Excerpt text',
      });
    });
    const rows = await withOrg(orgA, (tx) => tx.select().from(conversation).where(and(eq(conversation.orgId, orgA), eq(conversation.clientId, auId))));
    expect(rows).toHaveLength(1);
  });

  it('T2 the app role sees no chat rows without app.org_id', async () => {
    for (const table of ['conversation', 'chat_message', 'chat_citation']) {
      const rows = await pool.query(`select count(*)::int as n from ${table}`);
      expect(rows.rows[0].n).toBe(0);
    }
  });

  it("T3 firm B sees none of firm A's rows", async () => {
    await withOrg(orgB, async (tx) => {
      expect(await tx.select().from(conversation)).toHaveLength(0);
      expect(await tx.select().from(chatMessage)).toHaveLength(0);
      expect(await tx.select().from(chatCitation)).toHaveLength(0);
    });
  });

  it('T4 withOrg cannot insert a conversation for another firm', async () => {
    const msg = await failure(
      withOrg(orgB, (tx) => tx.insert(conversation).values({ orgId: orgA, clientId: auId, userId: userA, title: 'x' })),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it("T5 a conversation with firm B's org_id cannot point at firm A's client", async () => {
    const msg = await failure(
      withOrg(orgB, (tx) => tx.insert(conversation).values({ orgId: orgB, clientId: auId, userId: userA, title: 'x' })),
    );
    expect(msg).toMatch(/foreign key/);
  });

  it('T6 a hub conversation needs a scope', async () => {
    const noScope = await failure(
      withOrg(orgA, (tx) => tx.insert(conversation).values({ orgId: orgA, clientId: null, scope: null, userId: userA, title: 'x' })),
    );
    expect(noScope).toMatch(/conversation_client_or_scope_check/);
    const both = await failure(
      withOrg(orgA, (tx) => tx.insert(conversation).values({ orgId: orgA, clientId: auId, scope: 'AU', userId: userA, title: 'x' })),
    );
    expect(both).toMatch(/conversation_client_or_scope_check/);
  });

  it("T7 a user message must be 'sent'", async () => {
    const msg = await failure(
      withOrg(orgA, async (tx) => {
        const conv = first(
          await tx.insert(conversation).values({ orgId: orgA, clientId: null, scope: 'ALL', userId: userA, title: 'x' }).returning(),
        );
        await tx.insert(chatMessage).values({ orgId: orgA, conversationId: conv.id, role: 'user', status: 'answered', body: 'q', createdBy: userA });
      }),
    );
    expect(msg).toMatch(/chat_message_role_status_check/);
  });

  it('T8 chub_app can insert ai_usage but not update or delete it', async () => {
    await pool.query(
      'insert into ai_usage (org_id,user_id,provider,model,input_tokens,output_tokens,cost_micro_usd) values ($1,$2,$3,$4,1,1,1)',
      [usageOrg, userA, 'stub', 'stub-model'],
    );
    await expect(pool.query(`update ai_usage set model = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(pool.query('delete from ai_usage')).rejects.toThrow(/permission denied/);
  });

  it('T9 deleting a client deletes its chats', async () => {
    const clientId = await makeClient('Chat AU Co 2');
    await withOrg(orgA, (tx) => tx.insert(conversation).values({ orgId: orgA, clientId, userId: userA, title: 'gone' }));
    const before = await withOrg(orgA, (tx) => tx.select().from(conversation).where(and(eq(conversation.orgId, orgA), eq(conversation.clientId, clientId))));
    expect(before).toHaveLength(1);
    const del = await call('DELETE', `/api/clients/${clientId}`, { cookie: cookieA });
    expect(del.status).toBe(204);
    const after = await withOrg(orgA, (tx) => tx.select().from(conversation).where(and(eq(conversation.orgId, orgA), eq(conversation.clientId, clientId))));
    expect(after).toHaveLength(0);
  });
});
