import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { client, document } from '../db/schema';
import { withOrg, type Tx } from '../db/withOrg';
import type { DocumentKind } from '../documents/extract';
import { aadFor, seal, unseal } from '../privacy/crypto';
import type { DocumentView } from '../types/documents';
import { recordEvent, type AuditActor } from './auditEventService';

// Documents are stored sealed (privacy/crypto.ts). Nothing here logs a name, bytes or text (Hard rule 13).
export const MAX_DOCUMENTS_PER_CLIENT = 200; // untuned

interface ViewRow {
  id: string;
  clientId: string;
  originalName: string;
  kind: DocumentKind;
  byteSize: number;
  textChars: number;
  truncated: boolean;
  uploadedBy: string;
  createdAt: Date;
}

// Explicit columns: a list or view never selects fileEnc or textEnc.
const viewColumns = {
  id: document.id,
  clientId: document.clientId,
  originalName: document.originalName,
  kind: document.kind,
  byteSize: document.byteSize,
  textChars: document.textChars,
  truncated: document.truncated,
  uploadedBy: document.uploadedBy,
  createdAt: document.createdAt,
};

export function toDocumentView(r: ViewRow): DocumentView {
  return {
    id: r.id,
    clientId: r.clientId,
    originalName: r.originalName,
    kind: r.kind,
    byteSize: r.byteSize,
    textChars: r.textChars,
    truncated: r.truncated,
    uploadedBy: r.uploadedBy,
    createdAt: r.createdAt.toISOString(),
  };
}

async function clientExists(tx: Tx, orgId: string, clientId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
    .limit(1);
  return rows.length > 0;
}

function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error) || !('cause' in err) || typeof err.cause !== 'object' || err.cause === null) return false;
  return 'code' in err.cause && err.cause.code === '23505';
}

export async function listDocuments(orgId: string, clientId: string): Promise<DocumentView[] | null> {
  return withOrg(orgId, async (tx) => {
    if (!(await clientExists(tx, orgId, clientId))) return null;
    const rows = await tx
      .select(viewColumns)
      .from(document)
      .where(and(eq(document.orgId, orgId), eq(document.clientId, clientId)))
      .orderBy(desc(document.createdAt));
    return rows.map(toDocumentView);
  });
}

export type UploadOutcome = { document: DocumentView; created: boolean } | { notFound: true } | { full: true };

async function findBySha(orgId: string, clientId: string, sha256: string): Promise<DocumentView | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select(viewColumns)
      .from(document)
      .where(and(eq(document.orgId, orgId), eq(document.clientId, clientId), eq(document.sha256, sha256)))
      .limit(1);
    const row = rows[0];
    return row ? toDocumentView(row) : null;
  });
}

export async function uploadDocument(
  orgId: string,
  actor: AuditActor,
  clientId: string,
  input: { name: string; kind: DocumentKind; bytes: Uint8Array; text: string; truncated: boolean },
): Promise<UploadOutcome> {
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');

  const pre = await withOrg(orgId, async (tx): Promise<UploadOutcome | null> => {
    if (!(await clientExists(tx, orgId, clientId))) return { notFound: true };
    const dup = await tx
      .select(viewColumns)
      .from(document)
      .where(and(eq(document.orgId, orgId), eq(document.clientId, clientId), eq(document.sha256, sha256)))
      .limit(1);
    const found = dup[0];
    if (found) return { document: toDocumentView(found), created: false };
    const counted = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(document)
      .where(and(eq(document.orgId, orgId), eq(document.clientId, clientId)));
    if ((counted[0]?.n ?? 0) >= MAX_DOCUMENTS_PER_CLIENT) return { full: true };
    return null;
  });
  if (pre) return pre;

  // Sealing happens outside any transaction.
  const id = randomUUID();
  const fileEnc = seal(input.bytes, aadFor('document.file', orgId, id));
  const textEnc = seal(Buffer.from(input.text, 'utf8'), aadFor('document.text', orgId, id));

  try {
    const inserted = await withOrg(orgId, async (tx) => {
      const rows = await tx
        .insert(document)
        .values({
          id,
          orgId,
          clientId,
          uploadedBy: actor.userId,
          originalName: input.name,
          kind: input.kind,
          byteSize: input.bytes.length,
          sha256,
          textChars: input.text.length,
          truncated: input.truncated,
          fileEnc,
          textEnc,
        })
        .returning(viewColumns);
      const created = rows[0];
      if (created) {
        await recordEvent(tx, {
          orgId,
          actorId: actor.userId,
          ipKey: actor.ipKey,
          action: 'document.upload',
          targetType: 'document',
          targetId: created.id,
          detail: { clientId, kind: input.kind, byteSize: input.bytes.length },
        });
      }
      return rows;
    });
    const row = inserted[0];
    if (!row) throw new Error('insert returned no row');
    return { document: toDocumentView(row), created: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await findBySha(orgId, clientId, sha256);
    if (!existing) throw err;
    return { document: existing, created: false };
  }
}

export async function readDocumentFile(
  orgId: string,
  actor: AuditActor,
  clientId: string,
  id: string,
): Promise<{ name: string; bytes: Buffer } | null> {
  const row = await withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({ originalName: document.originalName, fileEnc: document.fileEnc })
      .from(document)
      .where(and(eq(document.id, id), eq(document.clientId, clientId), eq(document.orgId, orgId)))
      .limit(1);
    const found = rows[0];
    if (!found) return null;
    await recordEvent(tx, {
      orgId,
      actorId: actor.userId,
      ipKey: actor.ipKey,
      action: 'document.download',
      targetType: 'document',
      targetId: id,
      detail: { clientId },
    });
    return found;
  });
  if (!row) return null;
  return { name: row.originalName, bytes: unseal(row.fileEnc, aadFor('document.file', orgId, id)) };
}

export async function deleteDocument(orgId: string, actor: AuditActor, clientId: string, id: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .delete(document)
      .where(and(eq(document.id, id), eq(document.clientId, clientId), eq(document.orgId, orgId)))
      .returning({ id: document.id });
    if (rows.length === 0) return false;
    await recordEvent(tx, {
      orgId,
      actorId: actor.userId,
      ipKey: actor.ipKey,
      action: 'document.delete',
      targetType: 'document',
      targetId: id,
      detail: { clientId },
    });
    return true;
  });
}

/** For the chat (P4c): opened texts of the given documents, in createdAt order. */
export async function openDocumentTexts(
  orgId: string,
  ids: string[],
): Promise<{ id: string; name: string; text: string }[]> {
  if (ids.length === 0) return [];
  const rows = await withOrg(orgId, async (tx) =>
    tx
      .select({ id: document.id, originalName: document.originalName, textEnc: document.textEnc })
      .from(document)
      .where(and(eq(document.orgId, orgId), inArray(document.id, ids)))
      .orderBy(asc(document.createdAt)),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.originalName,
    text: unseal(r.textEnc, aadFor('document.text', orgId, r.id)).toString('utf8'),
  }));
}
