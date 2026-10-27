import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect } from 'vitest';
import type { KbVersionDetail } from '../types/kb';
import { call } from './helpers';
import { testEnv } from './testEnv';

const tag = randomUUID().slice(0, 8);
const beforeSources = new Set<string>();

export async function snapshotKb(): Promise<void> {
  const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
  try {
    for (const r of (await adminPool.query('select id from kb_source')).rows) beforeSources.add(String(r.id));
  } finally {
    await adminPool.end();
  }
}

/** Removes every source, version and chunk added since snapshotKb(), so other test files see the DB as it was. */
export async function cleanupKb(): Promise<void> {
  const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
  try {
    const srcs = (await adminPool.query('select id from kb_source')).rows
      .map((r) => String(r.id))
      .filter((id) => !beforeSources.has(id));
    await adminPool.query(
      'delete from kb_chunk where version_id in (select id from kb_version where source_id = any($1::uuid[]))',
      [srcs],
    );
    await adminPool.query('delete from kb_version where source_id = any($1::uuid[])', [srcs]);
    await adminPool.query('delete from kb_source where id = any($1::uuid[])', [srcs]);
  } finally {
    await adminPool.end();
  }
}

function post(adminCookie: string, path: string, body: unknown): Promise<Response> {
  return call('POST', `/api/admin/kb${path}`, { cookie: adminCookie, body });
}

async function makeSource(adminCookie: string, over: Record<string, unknown>): Promise<string> {
  const res = await post(adminCookie, '/sources', {
    jurisdiction: 'AU',
    kind: 'act',
    citation: 'Chat Fixture Act (Cth)',
    officialUrl: 'https://www.legislation.gov.au/C2026A00002',
    ...over,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { source: { id: string } }).source.id;
}

async function makeDraft(adminCookie: string, sourceId: string, text: string): Promise<string> {
  const res = await post(adminCookie, `/sources/${sourceId}/versions`, {
    method: 'paste',
    text,
    label: `Chat fixture ${tag}`,
    effectiveFrom: '2026-07-01',
    retrievedOn: '2026-10-26',
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { detail: KbVersionDetail }).detail.version.id;
}

/** Creates a source with a published version; returns the source id. */
export async function publishFixture(adminCookie: string, source: Record<string, unknown>, text: string): Promise<string> {
  const id = await makeSource(adminCookie, source);
  const versionId = await makeDraft(adminCookie, id, text);
  expect((await post(adminCookie, `/versions/${versionId}/publish`, {})).status).toBe(200);
  return id;
}

/** Creates a source with a draft version only; returns the source id. */
export async function draftFixture(adminCookie: string, source: Record<string, unknown>, text: string): Promise<string> {
  const id = await makeSource(adminCookie, source);
  await makeDraft(adminCookie, id, text);
  return id;
}
