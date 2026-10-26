import { runMigrations } from '../src/db/migrate';

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error('DATABASE_ADMIN_URL is not set');
await runMigrations(url);
console.log('migrations applied');
