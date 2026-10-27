import { eq, inArray } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fact } from '../../../src/data/schemas';
import { db, pool } from '../db/client';
import { kbChunk, kbFact, kbSource, kbVersion } from '../db/schema';
import { seedCurriculum, type CurriculumFile } from '../kb/curriculum';
import { seedFacts } from '../kb/seedFacts';
import { searchKb } from '../kb/retrieve';
import { testEnv } from './testEnv';

const TODAY = '2026-10-26';
const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });

const factOne: Fact = {
  label: 'Test rate one',
  jurisdiction: 'INTL',
  unit: 'bp',
  value: 1000,
  effectiveFrom: '2000-01-01',
  source: 'https://www.ifrs.org/x',
  verifiedOn: '2026-10-25',
};
const factTwo: Fact = {
  label: 'Test limit two',
  jurisdiction: 'INTL',
  unit: 'count',
  value: 5,
  effectiveFrom: '2000-01-01',
  source: 'https://www.ifrs.org/y',
  verifiedOn: null,
};
const facts: Record<string, Fact> = { 'intl.test.one': factOne, 'intl.test.two': factTwo };

function doc(title: string, jurisdiction: string, extra: string): string {
  return `---\ntitle: ${title}\njurisdiction: ${jurisdiction}\n---\n\n## Overview\n\nThe rate is {{fact:intl.test.one}} and the limit is {{fact:intl.test.two}}. ${extra}\n`;
}

const files: CurriculumFile[] = [
  { relPath: 'australia/kangaroo-guide.md', raw: doc('Kangaroo guide', 'AU', 'Kangaroo notes for the seed test.') },
  { relPath: 'standards/wombat-guide.md', raw: doc('Wombat guide', 'INTL', 'Wombat notes for the seed test.') },
];
const KANGAROO = '/knowledge/learn/australia/kangaroo-guide';

beforeAll(async () => {
  await seedFacts(facts, TODAY);
});

afterAll(async () => {
  await pool.end();
  await adminPool.end();
});

async function versionsFor(sitePath: string) {
  const src = (await db.select().from(kbSource).where(eq(kbSource.sitePath, sitePath)).limit(1))[0];
  if (!src) throw new Error('source missing');
  return { src, versions: await db.select().from(kbVersion).where(eq(kbVersion.sourceId, src.id)) };
}

describe('kb seed', () => {
  it('S1 first run creates and publishes both', async () => {
    const report = await seedCurriculum(files, null, TODAY);
    expect(report).toEqual({ created: 2, published: 2, unchanged: 0, skipped: 0 });
    const res = await searchKb({ query: 'kangaroo', includeBills: true, limit: 8 }, null);
    const hit = res.results.find((r) => r.kind === 'curriculum');
    expect(hit?.sitePath).toBe(KANGAROO);
  });

  it('S2 second run changes nothing', async () => {
    const report = await seedCurriculum(files, null, TODAY);
    expect(report).toEqual({ created: 0, published: 0, unchanged: 2, skipped: 0 });
  });

  it('S3 the body keeps tokens and the chunks render them', async () => {
    const { versions } = await versionsFor(KANGAROO);
    const pub = versions.find((v) => v.status === 'published');
    expect(pub?.bodyMd).toContain('{{fact:intl.test.two}}');
    const chunks = await db.select({ text: kbChunk.text }).from(kbChunk).where(eq(kbChunk.versionId, pub?.id ?? ''));
    expect(chunks.some((c) => c.text.includes('5 (unverified)'))).toBe(true);
  });

  it('S4 an edited doc publishes a new version and supersedes the old', async () => {
    const edited: CurriculumFile[] = [
      { relPath: 'australia/kangaroo-guide.md', raw: doc('Kangaroo guide', 'AU', 'Kangaroo notes were revised.') },
      files[1]!,
    ];
    const report = await seedCurriculum(edited, null, '2026-10-27');
    expect(report).toEqual({ created: 0, published: 1, unchanged: 1, skipped: 0 });
    const { versions } = await versionsFor(KANGAROO);
    expect(versions.filter((v) => v.status === 'published')).toHaveLength(1);
    expect(versions.filter((v) => v.status === 'superseded')).toHaveLength(1);
  });

  it('S5 an unknown jurisdiction throws', async () => {
    const bad: CurriculumFile[] = [{ relPath: 'uk/bad-guide.md', raw: doc('Bad guide', 'FR', 'x') }];
    await expect(seedCurriculum(bad, null, TODAY)).rejects.toThrow('Unknown jurisdiction in uk/bad-guide.md');
  });

  it('S6 unknown fact throws before any write', async () => {
    const raw = `---\ntitle: Missing guide\njurisdiction: UK\n---\n\n## Overview\n\nThe rate is {{fact:uk.test.missing}}.\n`;
    await expect(seedCurriculum([{ relPath: 'uk/missing-guide.md', raw }], null, TODAY)).rejects.toThrow(
      'Run kb:seed-facts first: uk/missing-guide.md',
    );
    const rows = await db.select().from(kbSource).where(eq(kbSource.sitePath, '/knowledge/learn/uk/missing-guide'));
    expect(rows).toHaveLength(0);
  });

  it('S7 meta is stored', async () => {
    const { src } = await versionsFor(KANGAROO);
    expect(src.meta?.section).toBe('australia');
    expect(src.meta?.slug).toBe('kangaroo-guide');
  });

  it('S8 a guide published by the admin is skipped', async () => {
    const { versions } = await versionsFor(KANGAROO);
    const pub = versions.find((v) => v.status === 'published');
    await adminPool.query(`update kb_version set published_by = 'u-admin' where id = $1`, [pub?.id]);
    const report = await seedCurriculum(files, null, TODAY);
    expect(report.skipped).toBe(1);
    expect(report.published).toBe(0);
  });

  it('F-S1 seedFacts is idempotent', async () => {
    expect(await seedFacts(facts, TODAY)).toEqual({ created: 0, updated: 0, unchanged: 2, skipped: [] });
  });

  it('F-S2 an admin-edited fact is not overwritten', async () => {
    await adminPool.query(`update kb_fact set updated_by = 'u-admin' where key = 'intl.test.one'`);
    const report = await seedFacts({ ...facts, 'intl.test.one': { ...factOne, value: 1100 } }, TODAY);
    expect(report.skipped).toEqual(['intl.test.one']);
    const row = (await db.select().from(kbFact).where(inArray(kbFact.key, ['intl.test.one'])))[0];
    expect(row?.valueNum).toBe(1000);
  });
});
