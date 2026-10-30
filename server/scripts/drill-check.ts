// Restore drill check (P5d). Connects as the owner to the restored scratch database (read only), counts rows, checks migrations, and opens sealed rows with the configured key. Prints counts only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { aadFor, unseal } from '../src/privacy/crypto';

const url = process.env.DRILL_DATABASE_URL;
if (!url) throw new Error('DRILL_DATABASE_URL is not set');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const counts: Record<string, number> = {};
  for (const table of ['organization', '"user"', 'client', 'document', 'conversation', 'chat_message', 'kb_chunk', 'kb_fact', 'audit_event', 'request_link']) {
    const r = await client.query(`select count(*)::int as n from ${table}`);
    const n = r.rows[0].n as number;
    counts[table] = n;
    console.log(`count ${table.replaceAll('"', '')}: ${n}`);
  }
  if (counts['kb_fact'] === 0) throw new Error('kb_fact is empty');

  const journal = JSON.parse(readFileSync(fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url)), 'utf8')) as { entries: unknown[] };
  const m = await client.query('select count(*)::int as n from drizzle.__drizzle_migrations');
  const applied = m.rows[0].n as number;
  console.log(`migrations: ${applied} of ${journal.entries.length}`);
  if (applied !== journal.entries.length) throw new Error('migrations differ from the journal');

  let opened = 0;
  let total = 0;
  const tryOpen = (value: Buffer, label: Parameters<typeof aadFor>[0], orgId: string, id: string) => {
    total += 1;
    try {
      unseal(value, aadFor(label, orgId, id));
      opened += 1;
    } catch {
      // counted as not opened
    }
  };
  const docs = await client.query('select id, org_id, file_enc, text_enc from document order by created_at desc limit 5');
  for (const r of docs.rows) {
    tryOpen(r.file_enc, 'document.file', r.org_id, r.id);
    tryOpen(r.text_enc, 'document.text', r.org_id, r.id);
  }
  const convs = await client.query('select id, org_id, redaction_map from conversation where redaction_map is not null order by created_at desc limit 5');
  for (const r of convs.rows) tryOpen(r.redaction_map, 'conversation', r.org_id, r.id);
  const links = await client.query('select id, org_id, token_enc from request_link order by created_at desc limit 5');
  for (const r of links.rows) tryOpen(r.token_enc, 'request_link.token', r.org_id, r.id);
  console.log(`sealed rows opened: ${opened} of ${total}`);
  if (opened < total) throw new Error('a sealed row did not open with this DATA_ENCRYPTION_KEY');
  console.log('restore drill passed');
} catch (e) {
  console.log(`restore drill FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
