import pg from 'pg';
import { setPlatformAdmin } from '../src/services/platformAdmin';

const [mode, email] = [process.argv[2], process.argv[3]];
if ((mode !== 'promote' && mode !== 'demote') || !email) {
  console.log('Usage: npm run admin:promote -- you@example.com  |  npm run admin:demote -- you@example.com');
  process.exitCode = 1;
} else {
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) throw new Error('DATABASE_ADMIN_URL is not set');
  const pool = new pg.Pool({ connectionString });
  try {
    const r = await setPlatformAdmin(pool, email, mode === 'promote');
    if (r.ok) console.log(mode === 'promote' ? `Platform admin is now ${r.email}` : `${r.email} is no longer the platform admin`);
    else {
      console.log(r.error);
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}
