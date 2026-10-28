import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setEmbedderForTests } from '../ai/embed';
import { setOfficialFetchForTests } from '../kb/fetchOfficial';
import { pool } from '../db/client';
import type { KbSearchResponse, KbVersionDetail } from '../types/kb';
import { call, makePlatformAdmin, ORIGIN, signUp } from './helpers';
import { failingEmbedder, fakeEmbedder } from './fakeEmbedder';
import { startApp, stopApp } from './server';
import { testEnv } from './testEnv';

const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
const ukFixture = readFileSync(join(__dirname, 'fixtures/kb/uk-act-extract.txt'), 'utf8');
const auFixture = readFileSync(join(__dirname, 'fixtures/kb/au-act-extract.md'), 'utf8');

let admin: Awaited<ReturnType<typeof signUp>>;
let ordinary: Awaited<ReturnType<typeof signUp>>;

const AU_URL = 'https://www.legislation.gov.au/C2026A00001';
let auSourceId = '';
let auCitation = '';
let v1Id = '';
let v2Id = '';

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

async function post(path: string, body: unknown): Promise<Response> {
  return call('POST', `/api/admin/kb${path}`, { cookie: admin.cookie, body });
}

async function makeSource(over: Record<string, unknown>): Promise<{ id: string; citation: string }> {
  const res = await post('/sources', {
    jurisdiction: 'AU',
    kind: 'act',
    title: 'Example Act 2026',
    citation: 'Example Act 2026 (Cth)',
    officialUrl: AU_URL,
    ...over,
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { source: { id: string; citation: string } };
  return body.source;
}

async function pasteDraft(sourceId: string, text: string, label: string): Promise<Response> {
  return post(`/sources/${sourceId}/versions`, {
    method: 'paste',
    text,
    label,
    effectiveFrom: '2026-07-01',
    retrievedOn: '2026-10-26',
  });
}

async function publishPasted(over: Record<string, unknown>, text: string, label = 'Compilation 1'): Promise<string> {
  const source = await makeSource(over);
  const created = await pasteDraft(source.id, text, label);
  expect(created.status).toBe(201);
  const versionId = ((await created.json()) as { detail: KbVersionDetail }).detail.version.id;
  const pub = await post(`/versions/${versionId}/publish`, {});
  expect(pub.status).toBe(200);
  return versionId;
}

async function search(body: Record<string, unknown>): Promise<KbSearchResponse> {
  const res = await post('/search', body);
  expect(res.status).toBe(200);
  return (await res.json()) as KbSearchResponse;
}

describe('kb', () => {
  it('K1 every /api/admin/kb route is 404 for an ordinary user', async () => {
    const checks: [string, string, unknown?][] = [
      ['GET', '/api/admin/kb/sources'],
      ['POST', '/api/admin/kb/sources', { jurisdiction: 'AU', kind: 'act', title: 'X Act', citation: 'X Act' }],
      ['POST', '/api/admin/kb/search', { query: 'anything' }],
    ];
    for (const [method, path, body] of checks) {
      const res = await call(method, path, { cookie: ordinary.cookie, body });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
    }
  });

  it('K2 POST /sources creates an act → 201', async () => {
    const source = await makeSource({});
    auSourceId = source.id;
    auCitation = source.citation;
    expect(auSourceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('K3 POST /sources rejects kind curriculum → 400', async () => {
    const res = await post('/sources', {
      jurisdiction: 'AU',
      kind: 'curriculum',
      title: 'Guide',
      citation: 'Guide',
    });
    expect(res.status).toBe(400);
  });

  it('K4 a pasted draft is chunked by provision', async () => {
    const res = await post(`/sources/${auSourceId}/versions`, {
      method: 'paste',
      text: auFixture,
      label: 'Compilation 1',
      effectiveFrom: '2026-07-01',
      retrievedOn: '2026-10-26',
    });
    expect(res.status).toBe(201);
    const { detail } = (await res.json()) as { detail: KbVersionDetail };
    expect(detail.chunks.map((c) => c.provisionRef)).toEqual([null, 's 23-5', 's 23-10', 's 25-1']);
    expect(detail.version.status).toBe('draft');
    expect(detail.diff.against).toBeNull();
    v1Id = detail.version.id;
  });

  it('K5 a draft is never returned by search', async () => {
    const out = await search({ query: 'required to be registered' });
    expect(out.results).toEqual([]);
  });

  it('K6 blocking issues stop publish → 422', async () => {
    const source = await makeSource({ officialUrl: null, title: 'No URL Act', citation: 'No URL Act 2026' });
    const created = await pasteDraft(source.id, auFixture, 'Compilation 1');
    expect(created.status).toBe(201);
    const { detail } = (await created.json()) as { detail: KbVersionDetail };
    expect(detail.version.issues.map((i) => i.code)).toContain('no_url');
    const pub = await post(`/versions/${detail.version.id}/publish`, {});
    expect(pub.status).toBe(422);
    const body = (await pub.json()) as { issues: { code: string }[] };
    expect(body.issues.map((i) => i.code)).toContain('no_url');
  });

  it('K7 publish → published and found by keyword search', async () => {
    const pub = await post(`/versions/${v1Id}/publish`, {});
    expect(pub.status).toBe(200);
    const { detail } = (await pub.json()) as { detail: KbVersionDetail };
    expect(detail.version.status).toBe('published');
    const out = await search({ query: 'required to be registered' });
    expect(out.mode).toBe('fts');
    expect(out.results[0]?.provisionRef).toBe('s 23-5');
    expect(out.results[0]?.versionLabel).toBe('Compilation 1');
    expect(out.results[0]?.citation).toBe(auCitation);
  });

  it('K8 a new version supersedes the old and only the new one is searched', async () => {
    const copy = await post(`/sources/${auSourceId}/versions`, {
      method: 'copy',
      label: 'Compilation 2',
      effectiveFrom: '2026-08-01',
      retrievedOn: '2026-10-26',
    });
    expect(copy.status).toBe(201);
    const copied = ((await copy.json()) as { detail: KbVersionDetail }).detail;
    v2Id = copied.version.id;
    const oldPara = 'The registration turnover is the example amount worked out under this Division.';
    expect(copied.version.bodyMd).toContain(oldPara);
    const patched = await call('PATCH', `/api/admin/kb/versions/${v2Id}`, {
      cookie: admin.cookie,
      body: {
        label: 'Compilation 2',
        bodyMd: copied.version.bodyMd.replace(oldPara, 'The zebracrossing amount is worked out under this Division.'),
      },
    });
    expect(patched.status).toBe(200);
    const { detail } = (await patched.json()) as { detail: KbVersionDetail };
    expect(detail.diff.changed).toEqual(['s 23-10']);
    const pub = await post(`/versions/${v2Id}/publish`, {});
    expect(pub.status).toBe(200);

    const old = await call('GET', `/api/admin/kb/versions/${v1Id}`, { cookie: admin.cookie });
    expect(((await old.json()) as { detail: KbVersionDetail }).detail.version.status).toBe('superseded');

    const zebra = await search({ query: 'zebracrossing' });
    expect(zebra.results.length).toBeGreaterThan(0);
    expect(zebra.results[0]?.versionLabel).toBe('Compilation 2');
    const reg = await search({ query: 'required to be registered' });
    const turnover = await search({ query: 'registration turnover' });
    for (const r of [...zebra.results, ...reg.results, ...turnover.results]) {
      expect(r.versionLabel).not.toBe('Compilation 1');
    }
  });

  it("K9 PATCH a published version → 409 'Only a draft can be edited'", async () => {
    const res = await call('PATCH', `/api/admin/kb/versions/${v2Id}`, { cookie: admin.cookie, body: { label: 'Renamed' } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Only a draft can be edited' });
  });

  it('K10 the database allows one published version per source', async () => {
    await expect(
      adminPool.query(`update kb_version set status = 'published' where id = $1`, [v1Id]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('K11 jurisdiction filter', async () => {
    await publishPasted(
      { jurisdiction: 'UK', title: 'Quokka Act 2026', citation: 'Quokka Act 2026 (UK)', officialUrl: 'https://www.legislation.gov.uk/ukpga/2026/1' },
      '# Quokka Act 2026\n\n## 1 Quokka rules\n\nThe quokka provision applies to example income.',
    );
    await publishPasted(
      { jurisdiction: 'INTL', kind: 'standard', title: 'Quokka Standard', citation: 'Quokka Standard 1', officialUrl: 'https://www.ifrs.org/quokka' },
      '# Quokka Standard\n\n## 1 Quokka scope\n\nThe quokka standard applies to example entities.',
    );
    const au = await search({ query: 'quokka', jurisdiction: 'AU' });
    expect(au.results.length).toBeGreaterThan(0);
    expect(new Set(au.results.map((r) => r.jurisdiction))).toEqual(new Set(['INTL']));
    const uk = await search({ query: 'quokka', jurisdiction: 'UK' });
    expect(new Set(uk.results.map((r) => r.jurisdiction))).toEqual(new Set(['UK', 'INTL']));
    const all = await search({ query: 'quokka' });
    expect(new Set(all.results.map((r) => r.jurisdiction))).toEqual(new Set(['UK', 'INTL']));
  });

  let billVersionId = '';
  it('K12 bills are flagged and can be excluded', async () => {
    billVersionId = await publishPasted(
      { kind: 'bill', billStatus: 'introduced', title: 'Wombat Bill 2026', citation: 'Wombat Bill 2026', officialUrl: 'https://www.aph.gov.au/wombat' },
      '# Wombat Bill 2026\n\n## 1 Wombat measure\n\nThe wombat measure would apply to example income.',
    );
    const flagged = await search({ query: 'wombat' });
    expect(flagged.results[0]?.kind).toBe('bill');
    expect(flagged.results[0]?.billStatus).toBe('introduced');
    const excluded = await search({ query: 'wombat', includeBills: false });
    expect(excluded.results).toEqual([]);
  });

  it('K13 withdraw → withdrawn and no longer searched', async () => {
    const res = await post(`/versions/${billVersionId}/withdraw`, {});
    expect(res.status).toBe(200);
    const { detail } = (await res.json()) as { detail: KbVersionDetail };
    expect(detail.version.status).toBe('withdrawn');
    const out = await search({ query: 'wombat' });
    expect(out.results).toEqual([]);
  });

  it('K14 audit rows carry no document text', async () => {
    const r = await adminPool.query<{ d: string }>(`select detail::text as d from admin_audit where action like 'kb.%'`);
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) expect(row.d).not.toContain('Required to be registered');
  });

  it('K15 GET /api/admin/overview counts sources and drafts', async () => {
    const res = await call('GET', '/api/admin/overview', { cookie: admin.cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { embeddingsEnabled: boolean; sources: number; drafts: number };
    expect(body.embeddingsEnabled).toBe(false);
    expect(body.sources).toBeGreaterThanOrEqual(4);
    expect(typeof body.drafts).toBe('number');
  });

  it('K16 publish with an embedder stores embeddings and search is hybrid', async () => {
    setEmbedderForTests(fakeEmbedder());
    try {
      const source = await makeSource({ title: 'Platypus Act 2026', citation: 'Platypus Act 2026 (Cth)' });
      const created = await pasteDraft(
        source.id,
        '# Platypus Act 2026\n\n## 5 Registration\n\nThe platypus registration threshold applies to example entities.',
        'Compilation 1',
      );
      expect(created.status).toBe(201);
      const versionId = ((await created.json()) as { detail: KbVersionDetail }).detail.version.id;
      const pub = await post(`/versions/${versionId}/publish`, {});
      expect(pub.status).toBe(200);
      const { detail } = (await pub.json()) as { detail: KbVersionDetail };
      expect(detail.chunks.length).toBeGreaterThan(0);
      for (const c of detail.chunks) expect(c.embedded).toBe(true);
      const out = await search({ query: 'platypus threshold' });
      expect(out.mode).toBe('hybrid');
      expect(out.results[0]?.ftsRank).not.toBeNull();
      expect(out.results[0]?.vectorRank).not.toBeNull();
    } finally {
      setEmbedderForTests(null);
    }
  });

  it('K17 a failing embedder leaves the version a draft → 502', async () => {
    setEmbedderForTests(failingEmbedder());
    try {
      const source = await makeSource({ title: 'Failing Act 2026', citation: 'Failing Act 2026 (Cth)' });
      const created = await pasteDraft(source.id, '# Failing Act 2026\n\n## 1 Rule\n\nThe failing rule applies.', 'Compilation 1');
      const versionId = ((await created.json()) as { detail: KbVersionDetail }).detail.version.id;
      const pub = await post(`/versions/${versionId}/publish`, {});
      expect(pub.status).toBe(502);
      const got = await call('GET', `/api/admin/kb/versions/${versionId}`, { cookie: admin.cookie });
      expect(((await got.json()) as { detail: KbVersionDetail }).detail.version.status).toBe('draft');
    } finally {
      setEmbedderForTests(null);
    }
  });

  it('K18 embed-missing fills chunks published without embeddings', async () => {
    setEmbedderForTests(null);
    try {
      await publishPasted(
        { title: 'Late Embed Act 2026', citation: 'Late Embed Act 2026 (Cth)' },
        '# Late Embed Act 2026\n\n## 1 Rule\n\nThe late embed rule applies to example entities.',
      );
      setEmbedderForTests(fakeEmbedder());
      const res = await post('/embed-missing', {});
      expect(res.status).toBe(200);
      const body = (await res.json()) as { embedded: number; remaining: number };
      expect(body.embedded).toBeGreaterThanOrEqual(1);
      expect(body.remaining).toBe(0);
      const ov = await call('GET', '/api/admin/overview', { cookie: admin.cookie });
      expect(((await ov.json()) as { chunksWithoutEmbedding: number }).chunksWithoutEmbedding).toBe(0);
    } finally {
      setEmbedderForTests(null);
    }
  });

  it('K19 embed-missing without an embedder → 409', async () => {
    setEmbedderForTests(null);
    const res = await post('/embed-missing', {});
    expect(res.status).toBe(409);
  });

  async function upload(sourceId: string, name: string | null, body: Uint8Array | string): Promise<Response> {
    const headers: Record<string, string> = { origin: ORIGIN, cookie: admin.cookie, 'content-type': 'application/octet-stream' };
    if (name !== null) headers['x-filename'] = encodeURIComponent(name);
    const query = new URLSearchParams({ label: 'Upload 1', retrievedOn: '2026-10-26' });
    return fetch(`${await startApp()}/api/admin/kb/sources/${sourceId}/versions/upload?${query.toString()}`, {
      method: 'POST',
      headers,
      body,
    });
  }

  it('K20 upload a .txt → 201 with chunks', async () => {
    const source = await makeSource({ jurisdiction: 'UK', title: 'Upload Act 2026', citation: 'Upload Act 2026 (UK)', officialUrl: 'https://www.legislation.gov.uk/ukpga/2026/2' });
    const res = await upload(source.id, 'uk-act-extract.txt', ukFixture);
    expect(res.status).toBe(201);
    const { detail } = (await res.json()) as { detail: KbVersionDetail };
    expect(detail.version.inputMethod).toBe('file');
    expect(detail.version.originalName).toBe('uk-act-extract.txt');
    expect(detail.chunks.length).toBeGreaterThan(0);
  });

  it('K21 upload an .exe → 415', async () => {
    const res = await upload(auSourceId, 'tool.exe', 'MZ');
    expect(res.status).toBe(415);
  });

  it('K22 upload over 20 MB → 413', async () => {
    const res = await upload(auSourceId, 'big.txt', new Uint8Array(21 * 1024 * 1024).fill(97));
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toContain('Too large');
  });

  it('K25 upload a real .pdf → 201 (the body arrives as a Buffer)', async () => {
    const source = await makeSource({ jurisdiction: 'UK', title: 'Upload PDF Act 2026', citation: 'Upload PDF Act 2026 (UK)', officialUrl: 'https://www.legislation.gov.uk/ukpga/2026/3' });
    const pdf = readFileSync(join(__dirname, 'fixtures/documents/sample.pdf'));
    const res = await upload(source.id, 'sample.pdf', new Uint8Array(pdf));
    expect(res.status).toBe(201);
    const { detail } = (await res.json()) as { detail: KbVersionDetail };
    expect(detail.chunks.map((c) => c.text).join(' ')).toContain('980.00');
  });

  it('K23 fetch a URL draft through the stubbed fetch', async () => {
    const url = 'https://www.legislation.gov.uk/ukpga/2026/1';
    setOfficialFetchForTests((async () =>
      new Response('<h2>Section 1 Test</h2><p>Body text</p>', { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch);
    try {
      const source = await makeSource({ jurisdiction: 'UK', title: 'Fetched Act 2026', citation: 'Fetched Act 2026 (UK)', officialUrl: null });
      const res = await post(`/sources/${source.id}/versions`, { method: 'url', url, label: 'Fetch 1', retrievedOn: '2026-10-26' });
      expect(res.status).toBe(201);
      const { detail } = (await res.json()) as { detail: KbVersionDetail };
      expect(detail.version.originalName).toBe(url);
      const got = await call('GET', `/api/admin/kb/sources/${source.id}`, { cookie: admin.cookie });
      expect(((await got.json()) as { source: { officialUrl: string | null } }).source.officialUrl).toBe(url);
    } finally {
      setOfficialFetchForTests(undefined);
    }
  });

  it('K24 a non-official URL → 422 naming the host', async () => {
    const res = await post(`/sources/${auSourceId}/versions`, {
      method: 'url',
      url: 'https://example.com/act',
      label: 'Bad',
      retrievedOn: '2026-10-26',
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toContain('example.com');
  });
});
