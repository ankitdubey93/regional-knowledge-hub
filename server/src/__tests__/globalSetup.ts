import pg from 'pg';
import { runMigrations } from '../db/migrate';
import { testEnv } from './testEnv';

// Every server test run starts from an empty, migrated chub_test.
export default async function setup(): Promise<void> {
  const pool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
  try {
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION chub;');
  } finally {
    await pool.end();
  }
  await runMigrations(testEnv.DATABASE_ADMIN_URL);
}
