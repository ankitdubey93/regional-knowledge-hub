import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { currentEmbedder } from '../src/ai/embed';
import { pool } from '../src/db/client';
import { seedCurriculum, type CurriculumFile } from '../src/kb/curriculum';

const docsDir = fileURLToPath(new URL('../../docs', import.meta.url));
const files: CurriculumFile[] = [];
for (const section of ['core-accounting', 'standards', 'australia', 'uk']) {
  for (const name of (await readdir(`${docsDir}/${section}`)).filter((n) => n.endsWith('.md')).sort()) {
    files.push({ relPath: `${section}/${name}`, raw: await readFile(`${docsDir}/${section}/${name}`, 'utf8') });
  }
}
const today = new Date().toISOString().slice(0, 10);
try {
  const { created, published, unchanged, skipped } = await seedCurriculum(files, currentEmbedder(), today);
  console.log(`Seeded curriculum: ${created} created, ${published} published, ${unchanged} unchanged, ${skipped} skipped`);
} finally {
  await pool.end();
}
