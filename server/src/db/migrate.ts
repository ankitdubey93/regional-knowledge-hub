import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

export async function runMigrations(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url });
  try {
    // fileURLToPath, not .pathname: the repo path contains spaces.
    const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
