// Reclaims space after retention purges (P5c). Runs as the owner role: VACUUM needs it, and chub_app must never own tables.
// Scheduled by the deploy (P5d), not by the app.
import pg from 'pg';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL is not set');
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('VACUUM (ANALYZE) "document"');
  await client.query('VACUUM (ANALYZE) "conversation"');
} finally {
  await client.end();
}
console.log('vacuum done');
