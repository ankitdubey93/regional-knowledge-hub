import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setEmbedderForTests } from '../ai/embed';
import type { Fact } from '../../../src/data/schemas';
import { db, pool } from '../db/client';
import { kbChunk, kbSource, kbVersion } from '../db/schema';
import { seedCurriculum, type CurriculumFile } from '../kb/curriculum';
import type { FactSaveResult } from '../types/facts';
import { call, makePlatformAdmin, signUp } from './helpers';
import { stopApp } from './server';
import { testEnv } from './testEnv';

const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
const KEY = 'intl.test.rate';
const GUIDE = '/knowledge/learn/standards/fact-test-guide';

let admin: Awaited<ReturnType<typeof signUp>>;
let ordinary: Awaited<ReturnType<typeof signUp>>;

const base: Fact = {
  label: 'Test rate',
  jurisdiction: 'INTL',
  unit: 'bp',
  value: 500,
  effectiveFrom: '2000-01-01',
  source: 'https://www.ifrs.org/x',
  verifiedOn: null,
};

function guide(extra: string): CurriculumFile[] {
  return [
    {
      relPath: 'standards/fact-test-guide.md',
      raw: `---\ntitle: Fact test guide\njurisdiction: INTL\n---\n\n## Overview\n\nThe test rate is {{fact:${KEY}}}. ${extra}\n`,
    },
  ];
}

beforeAll(async () => {
  setEmbedderForTests(null);
  admin = await signUp();
  await makePlatformAdmin(admin.userId);
  ordinary = await signUp();
});

afterAll(async () => {
  setEmbedderForTests(undefined);
  await stopApp();
  await pool.end();
  await adminPool.end();
});

function create(key: string, fact: Fact, confirmVerified = false): Promise<Response> {
  return call('POST', '/api/admin/facts', { cookie: admin.cookie, body: { key, fact, changeNote: 'Test create', confirmVerified } });
}
function patch(fact: Fact, confirmVerified = false): Promise<Response> {
  return call('PATCH', `/api/admin/facts/${KEY}`, { cookie: admin.cookie, body: { fact, changeNote: 'Test change', confirmVerified } });
}

async function chunkTexts(versionId: string): Promise<{ text: string; embedding: unknown }[]> {
  return db.select({ text: kbChunk.text, embedding: kbChunk.embedding }).from(kbChunk).where(eq(kbChunk.versionId, versionId));
}

describe('admin facts', () => {
  it('AF1 non-admin gets 404 on every facts route', async () => {
    const body = { key: KEY, fact: base, changeNote: 'x y z', confirmVerified: false };
    for (const cookie of [ordinary.cookie, undefined]) {
      expect((await call('GET', '/api/admin/facts', { cookie })).status).toBe(404);
      expect((await call('GET', `/api/admin/facts/${KEY}`, { cookie })).status).toBe(404);
      expect((await call('POST', '/api/admin/facts', { cookie, body })).status).toBe(404);
      expect((await call('PATCH', `/api/admin/facts/${KEY}`, { cookie, body: { fact: base, changeNote: 'x y z', confirmVerified: false } })).status).toBe(404);
    }
  });

  it('AF2 create writes the fact, one history row and one audit row', async () => {
    const res = await create(KEY, base);
    expect(res.status).toBe(201);
    const body = (await res.json()) as FactSaveResult;
    expect(body.detail.fact.verifiedOn).toBeNull();
    expect(body.detail.history).toHaveLength(1);
    const audit = await adminPool.query(`select * from admin_audit where action = 'kb.fact.create' and target_id = $1`, [KEY]);
    expect(audit.rowCount).toBe(1);
  });

  it('AF3 duplicate key is 409', async () => {
    const res = await create(KEY, base);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('A fact with this key already exists');
  });

  it('AF4 non-official source is 422', async () => {
    const res = await create('intl.test.bad', { ...base, source: 'https://example.com/x' });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { issues: { code: string }[] };
    expect(body.issues[0]?.code).toBe('source_not_official');
  });

  it('AF5 unit change is 422', async () => {
    const res = await patch({ ...base, unit: 'cents', value: 100 });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { issues: { code: string }[] };
    expect(body.issues[0]?.code).toBe('unit_changed');
  });

  it('AF6 confirm sets verifiedOn to today', async () => {
    const res = await patch(base, true);
    expect(res.status).toBe(200);
    const body = (await res.json()) as FactSaveResult;
    expect(body.detail.fact.verifiedOn).toBe(new Date().toISOString().slice(0, 10));
  });

  it('AF7 value change resets verifiedOn and re-chunks the published guide', async () => {
    await seedCurriculum(guide('Alpha.'), null, '2026-10-26');
    await seedCurriculum(guide('Beta.'), null, '2026-10-27');
    const res = await patch({ ...base, value: 750 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as FactSaveResult;
    expect(body.rechunked).toBeGreaterThanOrEqual(1);
    expect(body.detail.fact.verifiedOn).toBeNull();
    const src = (await db.select().from(kbSource).where(eq(kbSource.sitePath, GUIDE)))[0];
    const versions = await db.select().from(kbVersion).where(eq(kbVersion.sourceId, src?.id ?? ''));
    const pub = versions.find((v) => v.status === 'published');
    const chunks = await chunkTexts(pub?.id ?? '');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.text.includes('7.5%'))).toBe(true);
    expect(chunks.some((c) => /(?<![\d.])5%/.test(c.text))).toBe(false);
    expect(chunks.every((c) => c.embedding === null)).toBe(true);
  });

  it('AF8 superseded versions are not re-chunked', async () => {
    const src = (await db.select().from(kbSource).where(eq(kbSource.sitePath, GUIDE)))[0];
    const versions = await db.select().from(kbVersion).where(eq(kbVersion.sourceId, src?.id ?? ''));
    const old = versions.find((v) => v.status === 'superseded');
    expect(old).toBeDefined();
    const chunks = await chunkTexts(old?.id ?? '');
    expect(chunks.some((c) => /(?<![\d.])5%/.test(c.text))).toBe(true);
    expect(chunks.some((c) => c.text.includes('7.5%'))).toBe(false);
  });

  it('AF9 history is append-only for chub_app', async () => {
    await expect(pool.query(`update kb_fact_history set change_note = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(pool.query('delete from kb_fact_history')).rejects.toThrow(/permission denied/);
    await expect(pool.query('delete from kb_fact')).rejects.toThrow(/permission denied/);
  });

  it('AF10 nothing changed is 409', async () => {
    const res = await patch({ ...base, value: 750 });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe('Nothing changed');
  });
});
