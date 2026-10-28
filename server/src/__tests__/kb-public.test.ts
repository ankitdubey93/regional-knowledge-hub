import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setEmbedderForTests } from '../ai/embed';
import { curriculumMeta } from '@chub/shared/content/curriculumMeta';
import { parseFrontmatter } from '@chub/shared/content/frontmatter';
import { factsSchema, type SiteDoc } from '@chub/shared/data/schemas';
import { pool } from '../db/client';
import { seedCurriculum, type CurriculumFile } from '../kb/curriculum';
import { normaliseText } from '../kb/normalise';
import { seedFacts } from '../kb/seedFacts';
import type { LawDetail, LawListItem, SitePayload } from '../types/kbPublic';
import type { KbVersionDetail } from '../types/kb';
import { call, makePlatformAdmin, signUp } from './helpers';
import { testEnv } from './testEnv';
import { stopApp } from './server';

const REPO = join(__dirname, '../../..');
const today = new Date().toISOString().slice(0, 10);
const factsJson = factsSchema.parse(JSON.parse(readFileSync(join(REPO, 'shared/seed/facts.json'), 'utf8')));
const SECTIONS = ['core-accounting', 'standards', 'australia', 'uk'];
const files: CurriculumFile[] = [];
for (const section of SECTIONS) {
  for (const name of readdirSync(join(REPO, 'docs', section)).filter((n) => n.endsWith('.md')).sort()) {
    files.push({ relPath: `${section}/${name}`, raw: readFileSync(join(REPO, 'docs', section, name), 'utf8') });
  }
}

const tag = randomUUID().slice(0, 8);
let admin: Awaited<ReturnType<typeof signUp>>;
let auActId = '';
let ukBillId = '';
let draftOnlyId = '';
let withdrawnId = '';

function post(path: string, body: unknown): Promise<Response> {
  return call('POST', `/api/admin/kb${path}`, { cookie: admin.cookie, body });
}

async function makeSource(over: Record<string, unknown>): Promise<string> {
  const res = await post('/sources', {
    jurisdiction: 'AU',
    kind: 'act',
    citation: 'Public Test Act (Cth)',
    officialUrl: 'https://www.legislation.gov.au/C2026A00002',
    ...over,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { source: { id: string } }).source.id;
}

async function draft(sourceId: string, text: string): Promise<string> {
  const res = await post(`/sources/${sourceId}/versions`, {
    method: 'paste',
    text,
    label: `Public fixture ${tag}`,
    effectiveFrom: '2026-07-01',
    retrievedOn: '2026-10-26',
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { detail: KbVersionDetail }).detail.version.id;
}

async function published(over: Record<string, unknown>, text: string): Promise<string> {
  const id = await makeSource(over);
  const versionId = await draft(id, text);
  expect((await post(`/versions/${versionId}/publish`, {})).status).toBe(200);
  return id;
}

const ACT_TEXT = 'Section 1 Registration\n\nA person must register when the turnover test is met.\n';

const beforeSources = new Set<string>();
const beforeFacts = new Set<string>();

async function snapshot(): Promise<void> {
  const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
  try {
    for (const r of (await adminPool.query('select id from kb_source')).rows) beforeSources.add(String(r.id));
    for (const r of (await adminPool.query('select key from kb_fact')).rows) beforeFacts.add(String(r.key));
  } finally {
    await adminPool.end();
  }
}

/** Removes every source, version, chunk and fact this file added, so other test files see the DB as it was. */
async function cleanup(): Promise<void> {
  const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
  try {
    const srcs = (await adminPool.query('select id from kb_source')).rows
      .map((r) => String(r.id))
      .filter((id) => !beforeSources.has(id));
    const keys = (await adminPool.query('select key from kb_fact')).rows
      .map((r) => String(r.key))
      .filter((k) => !beforeFacts.has(k));
    await adminPool.query(
      'delete from kb_chunk where version_id in (select id from kb_version where source_id = any($1::uuid[]))',
      [srcs],
    );
    await adminPool.query('delete from kb_version where source_id = any($1::uuid[])', [srcs]);
    await adminPool.query('delete from kb_source where id = any($1::uuid[])', [srcs]);
    await adminPool.query('delete from kb_fact_history where fact_key = any($1::text[])', [keys]);
    await adminPool.query('delete from kb_fact where key = any($1::text[])', [keys]);
  } finally {
    await adminPool.end();
  }
}

beforeAll(async () => {
  await snapshot();
  setEmbedderForTests(null);
  admin = await signUp();
  await makePlatformAdmin(admin.userId);
  await seedFacts(factsJson, today);
  await seedCurriculum(files, null, today);

  auActId = await published({ title: `Public AU Act ${tag}`, citation: `Public AU Act ${tag} (Cth)` }, ACT_TEXT);
  ukBillId = await published(
    {
      jurisdiction: 'UK',
      kind: 'bill',
      billStatus: 'introduced',
      title: `Public UK Bill ${tag}`,
      citation: `Public UK Bill ${tag}`,
      officialUrl: 'https://bills.parliament.uk/bills/1',
    },
    ACT_TEXT,
  );
  draftOnlyId = await makeSource({ title: `Draft only Act ${tag}`, citation: `Draft only Act ${tag}` });
  await draft(draftOnlyId, ACT_TEXT);
  withdrawnId = await makeSource({ title: `Withdrawn Act ${tag}`, citation: `Withdrawn Act ${tag}` });
  const wv = await draft(withdrawnId, ACT_TEXT);
  expect((await post(`/versions/${wv}/publish`, {})).status).toBe(200);
  expect((await post(`/versions/${wv}/withdraw`, {})).status).toBe(200);
}, 120_000);

afterAll(async () => {
  setEmbedderForTests(undefined);
  await cleanup();
  await stopApp();
  await pool.end();
});

async function laws(query = ''): Promise<LawListItem[]> {
  const res = await call('GET', `/api/kb/laws${query}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { laws: LawListItem[] }).laws;
}

const mine = (list: LawListItem[]): LawListItem[] => list.filter((l) => l.title.endsWith(tag));

describe('public kb', () => {
  it('P1 site answers without a session', async () => {
    const res = await call('GET', '/api/kb/site');
    expect(res.status).toBe(200);
  });

  it('P2 site facts equal facts.json', async () => {
    const payload = (await (await call('GET', '/api/kb/site')).json()) as SitePayload;
    for (const [key, fact] of Object.entries(factsJson)) {
      expect(payload.facts[key], key).toEqual(fact);
    }
  });

  it('P3 site docs equal the repo docs', async () => {
    const payload = (await (await call('GET', '/api/kb/site')).json()) as SitePayload;
    const byId = new Map<string, SiteDoc>(payload.docs.map((d) => [d.id, d]));
    for (const { relPath, raw } of files) {
      const [section = '', file = ''] = relPath.split('/');
      const slug = file.replace(/\.md$/, '');
      const { data, body } = parseFrontmatter(raw);
      const doc = byId.get(`${section}/${slug}`);
      expect(doc, relPath).toBeDefined();
      const { id: _id, title, body: docBody, ...meta } = doc as SiteDoc;
      expect(meta, relPath).toEqual(curriculumMeta(section, slug, data));
      expect(title, relPath).toBe(String(data.title));
      expect(docBody, relPath).toBe(normaliseText(body));
    }
  });

  it('P4 ETag gives 304', async () => {
    const first = await call('GET', '/api/kb/site');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    await first.arrayBuffer();
    const base = (first.url || '').replace(/\/api\/kb\/site$/, '');
    const second = await fetch(`${base}/api/kb/site`, { headers: { 'if-none-match': etag ?? '' } });
    expect(second.status).toBe(304);
  });

  it('P5 laws list only published official sources', async () => {
    const list = await laws();
    expect(mine(list).map((l) => l.id).sort()).toEqual([auActId, ukBillId].sort());
    expect(list.map((l) => l.kind as string)).not.toContain('curriculum');
  });

  it('P6 laws filter by jurisdiction and kind', async () => {
    const uk = await laws('?jurisdiction=UK');
    expect(mine(uk).map((l) => l.id)).toEqual([ukBillId]);
    expect(uk.every((l) => l.jurisdiction === 'UK')).toBe(true);
    const acts = await laws('?kind=act');
    expect(mine(acts).map((l) => l.id)).toEqual([auActId]);
    expect(acts.every((l) => l.kind === 'act')).toBe(true);
  });

  it('P7 law detail 404s for draft-only and for a bad id', async () => {
    for (const id of [draftOnlyId, withdrawnId, 'not-a-uuid']) {
      const res = await call('GET', `/api/kb/laws/${id}`);
      expect(res.status, id).toBe(404);
      expect(await res.json()).toEqual({ error: 'Law not found' });
    }
  });

  it('P8 law detail returns the published body', async () => {
    const res = await call('GET', `/api/kb/laws/${auActId}`);
    expect(res.status).toBe(200);
    const { law } = (await res.json()) as { law: LawDetail };
    expect(law.id).toBe(auActId);
    expect(law.bodyMd).toContain('A person must register when the turnover test is met.');
    const bill = (await (await call('GET', `/api/kb/laws/${ukBillId}`)).json()) as { law: LawDetail };
    expect(bill.law.billStatus).toBe('introduced');
  });
});
