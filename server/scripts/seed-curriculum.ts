import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { currentEmbedder } from '../src/ai/embed';
import { pool } from '../src/db/client';
import { seedCurriculum, type CurriculumFile } from '../src/kb/curriculum';
import { fact, formatFact } from '../../src/data/facts';

const docsDir = fileURLToPath(new URL('../../docs', import.meta.url));
const files: CurriculumFile[] = [];
for (const section of ['core-accounting', 'standards', 'australia', 'uk']) {
  for (const name of (await readdir(`${docsDir}/${section}`)).filter((n) => n.endsWith('.md')).sort()) {
    files.push({ relPath: `${section}/${name}`, raw: await readFile(`${docsDir}/${section}/${name}`, 'utf8') });
  }
}
const renderFact = (key: string): string => {
  const f = fact(key);
  return f.verifiedOn === null ? `${formatFact(f)} (unverified)` : formatFact(f);
};
const today = new Date().toISOString().slice(0, 10);
try {
  const { created, published, unchanged } = await seedCurriculum(files, renderFact, currentEmbedder(), today);
  console.log(`Seeded curriculum: ${created} created, ${published} published, ${unchanged} unchanged`);
} finally {
  await pool.end();
}
