import pg from 'pg';

// Recreates chub_e2e, empty, for the Playwright suite. Refuses any other database.
const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL is not set');
if (new URL(url).pathname !== '/chub_e2e') throw new Error('e2e-db only resets chub_e2e');
const maintenance = new URL(url);
maintenance.pathname = '/chub';
const server = new pg.Pool({ connectionString: maintenance.toString() });
try {
  const found = await server.query(`select 1 from pg_database where datname = 'chub_e2e'`);
  if (found.rowCount === 0) await server.query('CREATE DATABASE chub_e2e OWNER chub');
} finally {
  await server.end();
}
const db = new pg.Pool({ connectionString: url });
try {
  await db.query('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION chub;');
} finally {
  await db.end();
}
console.log('chub_e2e reset');
