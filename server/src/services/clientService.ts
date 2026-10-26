import { and, asc, eq } from 'drizzle-orm';
import { client } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { profileProblems, type Client, type ClientInput, type ClientPatch } from '../types/clients';
import type { WorkspaceKind } from '../types';

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

export type UpdateOutcome = { client: Client } | { notFound: true } | { problems: string[] };
export type DeleteOutcome = 'deleted' | 'not_found' | 'self';

// Drizzle wraps the Postgres error; its code is on .cause (23505 = unique_violation on client_one_self_per_org).
function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error) || !(err.cause instanceof Error)) return false;
  return 'code' in err.cause && err.cause.code === '23505';
}

/** Returns null when a business already has its entity (the route answers 409). */
export async function createClient(
  orgId: string,
  createdBy: string,
  kind: WorkspaceKind,
  input: ClientInput,
): Promise<Client | null> {
  try {
    return await withOrg(orgId, async (tx) => {
      if (kind === 'business') {
        const existing = await tx.select({ id: client.id }).from(client).where(eq(client.orgId, orgId)).limit(1);
        if (existing.length > 0) return null;
      }
      const rows = await tx
        .insert(client)
        .values({ ...input, orgId, createdBy, isSelf: kind === 'business' })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('client insert returned no row');
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

export async function updateClient(orgId: string, id: string, patch: ClientPatch): Promise<UpdateOutcome> {
  return withOrg(orgId, async (tx) => {
    const found = await tx
      .select()
      .from(client)
      .where(and(eq(client.id, id), eq(client.orgId, orgId)))
      .limit(1);
    const row = found[0];
    if (!row) return { notFound: true };
    const problems = profileProblems({
      jurisdiction: patch.jurisdiction ?? row.jurisdiction,
      entityType: patch.entityType ?? row.entityType,
      taxRegistered: patch.taxRegistered ?? row.taxRegistered,
      taxPeriod: patch.taxPeriod !== undefined ? patch.taxPeriod : row.taxPeriod,
    });
    if (problems.length > 0) return { problems };
    const rows = await tx
      .update(client)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(client.id, id), eq(client.orgId, orgId)))
      .returning();
    const updated = rows[0];
    if (!updated) return { notFound: true };
    return { client: updated };
  });
}

export async function deleteClient(orgId: string, id: string): Promise<DeleteOutcome> {
  return withOrg(orgId, async (tx) => {
    const found = await tx
      .select({ isSelf: client.isSelf })
      .from(client)
      .where(and(eq(client.id, id), eq(client.orgId, orgId)))
      .limit(1);
    const row = found[0];
    if (!row) return 'not_found';
    if (row.isSelf) return 'self';
    await tx.delete(client).where(and(eq(client.id, id), eq(client.orgId, orgId)));
    return 'deleted';
  });
}
