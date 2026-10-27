import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/client';
import { seedFacts } from '../src/kb/seedFacts';
import { factsSchema } from '../../src/data/schemas';

const path = fileURLToPath(new URL('../../src/data/facts.json', import.meta.url));
const facts = factsSchema.parse(JSON.parse(await readFile(path, 'utf8')));
const today = new Date().toISOString().slice(0, 10);
try {
  const { created, updated, unchanged, skipped } = await seedFacts(facts, today);
  console.log(
    `Seeded facts: ${created} created, ${updated} updated, ${unchanged} unchanged, ${skipped.length} skipped${skipped.length ? ` (edited in admin: ${skipped.join(', ')})` : ''}`,
  );
} finally {
  await pool.end();
}
