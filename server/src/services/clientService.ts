import { and, asc, eq } from 'drizzle-orm';
import { client } from '../db/schema';
import { withOrg } from '../db/withOrg';
import type { Client, ClientInput, ClientPatch } from '../types/clients';

// Every function runs inside withOrg (RLS) and also keeps an explicit org_id predicate (Hard rule 11).

export async function listClients(orgId: string): Promise<Client[]> {
  return withOrg(orgId, async (tx) =>
    tx.select().from(client).where(eq(client.orgId, orgId)).orderBy(asc(client.name)),
  );
}

export async function getClient(orgId: string, id: string): Promise<Client | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select()
      .from(client)
      .where(and(eq(client.id, id), eq(client.orgId, orgId)))
      .limit(1);
    return rows[0] ?? null;
  });
}

export async function createClient(orgId: string, createdBy: string, input: ClientInput): Promise<Client> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .insert(client)
      .values({ ...input, orgId, createdBy })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('client insert returned no row');
    return row;
  });
}

export async function updateClient(orgId: string, id: string, patch: ClientPatch): Promise<Client | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .update(client)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(client.id, id), eq(client.orgId, orgId)))
      .returning();
    return rows[0] ?? null;
  });
}

export async function deleteClient(orgId: string, id: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .delete(client)
      .where(and(eq(client.id, id), eq(client.orgId, orgId)))
      .returning({ id: client.id });
    return rows.length > 0;
  });
}
