import { sql } from 'drizzle-orm';
import { db } from './client';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Every tenant query runs in here: one transaction with app.org_id set, so RLS scopes it (Hard rule 11). */
export async function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
