import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db, pool } from '../db/client';
import { kbSource, kbVersion } from '../db/schema';
import { searchKb } from '../kb/retrieve';
import { seedCurriculum, type CurriculumFile, type RenderFact } from '../kb/curriculum';

const renderFact: RenderFact = (key) => (key === 'x.one' ? '10%' : '5 (unverified)');
const TODAY = '2026-10-26';

function doc(title: string, jurisdiction: string, extra: string): string {
  return `---\ntitle: ${title}\njurisdiction: ${jurisdiction}\n---\n\n## Overview\n\nThe rate is {{fact:x.one}} and the limit is {{fact:x.two}}. ${extra}\n`;
}

const files: CurriculumFile[] = [
  { relPath: 'australia/kangaroo-guide.md', raw: doc('Kangaroo guide', 'AU', 'Kangaroo notes for the seed test.') },
  { relPath: 'standards/wombat-guide.md', raw: doc('Wombat guide', 'INTL', 'Wombat notes for the seed test.') },
];

afterAll(async () => {
  await pool.end();
});

async function publishedFor(sitePath: string) {
  const src = (await db.select().from(kbSource).where(eq(kbSource.sitePath, sitePath)).limit(1))[0];
  if (!src) throw new Error('source missing');
  const versions = await db.select().from(kbVersion).where(eq(kbVersion.sourceId, src.id));
  return versions;
}

describe('kb seed', () => {
  it('S1 first run creates and publishes both', async () => {
    const report = await seedCurriculum(files, renderFact, null, TODAY);
    expect(report).toEqual({ created: 2, published: 2, unchanged: 0 });
    const res = await searchKb({ query: 'kangaroo', includeBills: true, limit: 8 }, null);
    const hit = res.results.find((r) => r.kind === 'curriculum');
    expect(hit?.sitePath).toBe('/knowledge/learn/australia/kangaroo-guide');
  });

  it('S2 second run changes nothing', async () => {
    const report = await seedCurriculum(files, renderFact, null, TODAY);
    expect(report).toEqual({ created: 0, published: 0, unchanged: 2 });
  });

  it('S3 tokens are filled in, with unverified marked', async () => {
    const versions = await publishedFor('/knowledge/learn/australia/kangaroo-guide');
    const pub = versions.find((v) => v.status === 'published');
    expect(pub?.bodyMd).toContain('5 (unverified)');
    expect(pub?.bodyMd).not.toContain('{{fact:');
  });

  it('S4 an edited doc publishes a new version and supersedes the old', async () => {
    const edited: CurriculumFile[] = [
      { relPath: 'australia/kangaroo-guide.md', raw: doc('Kangaroo guide', 'AU', 'Kangaroo notes were revised.') },
      files[1]!,
    ];
    const report = await seedCurriculum(edited, renderFact, null, '2026-10-27');
    expect(report).toEqual({ created: 0, published: 1, unchanged: 1 });
    const versions = await publishedFor('/knowledge/learn/australia/kangaroo-guide');
    expect(versions.filter((v) => v.status === 'published')).toHaveLength(1);
    expect(versions.filter((v) => v.status === 'superseded')).toHaveLength(1);
  });

  it('S5 an unknown jurisdiction throws', async () => {
    const bad: CurriculumFile[] = [{ relPath: 'uk/bad-guide.md', raw: doc('Bad guide', 'FR', 'x') }];
    await expect(seedCurriculum(bad, renderFact, null, TODAY)).rejects.toThrow('Unknown jurisdiction in uk/bad-guide.md');
  });
});
