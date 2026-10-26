import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env';
import * as schema from './schema';

// Connects as chub_app, never the owner, so row-level security applies.
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });
