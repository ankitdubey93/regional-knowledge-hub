import { defineConfig } from 'drizzle-kit';

// `generate` only diffs schema.ts against drizzle/meta, so it needs no connection;
// migrations are applied by scripts/migrate.ts as the owner role.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_ADMIN_URL ?? '' },
});
