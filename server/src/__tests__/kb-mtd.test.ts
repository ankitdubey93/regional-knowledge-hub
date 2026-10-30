import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setChatProviderForTests } from '../ai/chat';
import { setEmbedderForTests } from '../ai/embed';
import { isCovered } from '../chat/coverage';
import { db, pool } from '../db/client';
import { kbChunk, kbSource, kbVersion } from '../db/schema';
import { factKeysIn, seedCurriculum } from '../kb/curriculum';
import { searchKbForChat } from '../kb/retrieve';
import { seedFacts } from '../kb/seedFacts';
import { asList } from '@chub/shared/content/curriculumMeta';
import { parseFrontmatter } from '@chub/shared/content/frontmatter';
import { factsSchema } from '@chub/shared/data/schemas';
import { parseSse, type ChatMessageView } from '@chub/shared/lib/chatWire';
import { cleanupKb, snapshotKb } from './kbFixtures';
import { call, createFirm, signUp } from './helpers';
import { stopApp } from './server';
import { stubProvider, type StubProvider } from './stubProvider';
import { testEnv } from './testEnv';

const DOC_PATH = fileURLToPath(new URL('../../../docs/uk/making-tax-digital.md', import.meta.url));
const FACTS_PATH = fileURLToPath(new URL('../../../shared/seed/facts.json', import.meta.url));
const SITE = '/knowledge/learn/uk/making-tax-digital';
const DOC_TITLE = 'Making Tax Digital';
const TODAY = '2026-10-30';
const Q_UPDATES = 'When are quarterly updates due under Making Tax Digital for Income Tax?';

let cookie = '';
let orgId = '';

interface Asked {
  status: number;
  events: { event: string; data: unknown }[];
}

async function ask(c: string, id: string, text: string): Promise<Asked> {
  const res = await call('POST', `/api/conversations/${id}/messages`, { cookie: c, body: { text } });
  const raw = await res.text();
  const parsed = parseSse(raw.endsWith('\n\n') ? raw : `${raw}\n\n`);
  return {
    status: res.status,
    events: parsed.events.map((e) => ({ event: e.event, data: JSON.parse(e.data) as unknown })),
  };
}

async function newChat(c: string, body: unknown): Promise<string> {
  const res = await call('POST', '/api/conversations', { cookie: c, body });
  if (res.status !== 201) throw new Error(`create chat failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { conversation: { id: string } }).conversation.id;
}

function use(script: Parameters<typeof stubProvider>[0]): StubProvider {
  const stub = stubProvider(script);
  setChatProviderForTests(stub);
  return stub;
}

function doneMessage(a: Asked): ChatMessageView {
  const d = a.events.find((e) => e.event === 'done');
  if (!d) throw new Error('no done event');
  return (d.data as { message: ChatMessageView }).message;
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
  await snapshotKb();
  setEmbedderForTests(null);
  const raw = await readFile(DOC_PATH, 'utf8');
  const all = factsSchema.parse(JSON.parse(await readFile(FACTS_PATH, 'utf8')));
  const needed = new Set([...factKeysIn(raw), ...asList(parseFrontmatter(raw).data.facts)]);
  await seedFacts(Object.fromEntries(Object.entries(all).filter(([k]) => needed.has(k))), TODAY);
  await seedCurriculum([{ relPath: 'uk/making-tax-digital.md', raw }], null, TODAY);
  const u = await signUp();
  const firm = await createFirm(u.cookie, 'MTD Test Firm');
  cookie = firm.cookie;
  orgId = firm.orgId;
}, 120_000);

afterAll(async () => {
  setEmbedderForTests(undefined);
  setChatProviderForTests(undefined);
  await cleanupKb();
  await ownerQuery('delete from ai_usage where org_id = $1', [orgId]);
  await stopApp();
  await pool.end();
});

describe('kb: making tax digital', () => {
  it('MTD1 a UK search finds the guide and the question is covered', async () => {
    const r = await searchKbForChat({ query: Q_UPDATES, jurisdiction: 'UK', includeBills: true, limit: 8 }, null);
    expect(r.results.some((x) => x.sitePath === SITE)).toBe(true);
    expect(isCovered(r)).toBe(true);
  });

  it('MTD2 an AU search does not return the UK guide', async () => {
    const r = await searchKbForChat({ query: Q_UPDATES, jurisdiction: 'AU', includeBills: true, limit: 8 }, null);
    expect(r.results.some((x) => x.sitePath === SITE)).toBe(false);
  });

  it("MTD3 the guide's chunks carry rendered facts, not tokens", async () => {
    const rows = await db
      .select({ text: kbChunk.text })
      .from(kbChunk)
      .innerJoin(kbVersion, eq(kbVersion.id, kbChunk.versionId))
      .innerJoin(kbSource, eq(kbSource.id, kbVersion.sourceId))
      .where(and(eq(kbSource.sitePath, SITE), eq(kbVersion.status, 'published')));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((c) => c.text.includes('{{fact:'))).toBe(false);
    expect(rows.some((c) => c.text.includes('£50,000'))).toBe(true);
  });

  it('MTD4 a UK hub chat answers from the guide and cites it', async () => {
    const stub = use({ chunks: ['Quarterly updates are sent from compatible software ', '[1].'] });
    const id = await newChat(cookie, { clientId: null, scope: 'UK' });
    const a = await ask(cookie, id, Q_UPDATES);
    expect(a.status).toBe(200);
    const m = doneMessage(a);
    expect(m.status).toBe('answered');
    expect(m.citations[0]?.title).toBe(DOC_TITLE);
    expect(m.flags).toEqual([]);
    expect(stub.calls).toHaveLength(1);
  });
});
