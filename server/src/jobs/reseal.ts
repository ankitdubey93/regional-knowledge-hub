// Key rotation (P5d): re-seals every sealed column whose key version is not the current one.
// Resumable: rows already on the current version are skipped. Runs firm by firm in withOrg (Hard rule 11). Logs nothing.
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { conversation, document, organization, requestLink } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { CryptoError, aadFor, seal, unseal, type Keyring } from '../privacy/crypto';

export const RESEAL_BATCH_SIZE = 100;
export interface ResealResult { documents: number; conversations: number; requestLinks: number }

type Table = 'document' | 'conversation' | 'request_link';

/** Opens with either key in the ring and seals again under the current one. Throws a content-free error naming table and id. */
function reseal(old: Buffer, label: Parameters<typeof aadFor>[0], orgId: string, id: string, table: Table, ring: Keyring): Buffer {
  const aad = aadFor(label, orgId, id);
  try {
    return seal(unseal(old, aad, ring), aad, ring);
  } catch (e) {
    if (e instanceof CryptoError) throw new Error(`Cannot open ${table} ${id}`);
    throw e;
  }
}

export async function resealAll(ring: Keyring, opts: { orgIds?: string[]; batchSize?: number } = {}): Promise<ResealResult> {
  const v = ring.current.version;
  const batchSize = opts.batchSize ?? RESEAL_BATCH_SIZE;
  const orgIds = opts.orgIds ?? (await db.select({ id: organization.id }).from(organization)).map((o) => o.id);
  const result: ResealResult = { documents: 0, conversations: 0, requestLinks: 0 };

  for (const org of orgIds) {
    // documents
    for (;;) {
      const rows = await withOrg(org, (tx) =>
        tx
          .select({ id: document.id, fileEnc: document.fileEnc, textEnc: document.textEnc })
          .from(document)
          .where(and(eq(document.orgId, org), sql`(get_byte(${document.fileEnc}, 0) <> ${v} OR get_byte(${document.textEnc}, 0) <> ${v})`))
          .orderBy(asc(document.id))
          .limit(batchSize),
      );
      if (rows.length === 0) break;
      let changed = 0;
      for (const r of rows) {
        const fileNew = r.fileEnc[0] === v ? null : reseal(r.fileEnc, 'document.file', org, r.id, 'document', ring);
        const textNew = r.textEnc[0] === v ? null : reseal(r.textEnc, 'document.text', org, r.id, 'document', ring);
        const n = await withOrg(org, async (tx) => {
          const conds = [eq(document.id, r.id), eq(document.orgId, org)];
          if (fileNew) conds.push(eq(document.fileEnc, r.fileEnc));
          if (textNew) conds.push(eq(document.textEnc, r.textEnc));
          const set: { fileEnc?: Buffer; textEnc?: Buffer } = {};
          if (fileNew) set.fileEnc = fileNew;
          if (textNew) set.textEnc = textNew;
          const upd = await tx.update(document).set(set).where(and(...conds)).returning({ id: document.id });
          return upd.length;
        });
        changed += n;
        result.documents += n;
      }
      if (changed === 0) break; // nothing moved (concurrent change): do not loop forever
    }

    // conversations
    for (;;) {
      const rows = await withOrg(org, (tx) =>
        tx
          .select({ id: conversation.id, map: conversation.redactionMap })
          .from(conversation)
          .where(and(eq(conversation.orgId, org), sql`${conversation.redactionMap} IS NOT NULL AND get_byte(${conversation.redactionMap}, 0) <> ${v}`))
          .orderBy(asc(conversation.id))
          .limit(batchSize),
      );
      if (rows.length === 0) break;
      let changed = 0;
      for (const r of rows) {
        if (!r.map) continue;
        const mapNew = reseal(r.map, 'conversation', org, r.id, 'conversation', ring);
        const n = await withOrg(org, async (tx) => {
          const upd = await tx
            .update(conversation)
            .set({ redactionMap: mapNew })
            .where(and(eq(conversation.id, r.id), eq(conversation.orgId, org), eq(conversation.redactionMap, r.map as Buffer)))
            .returning({ id: conversation.id });
          return upd.length;
        });
        changed += n;
        result.conversations += n;
      }
      if (changed === 0) break;
    }

    // request links
    for (;;) {
      const rows = await withOrg(org, (tx) =>
        tx
          .select({ id: requestLink.id, tokenEnc: requestLink.tokenEnc })
          .from(requestLink)
          .where(and(eq(requestLink.orgId, org), sql`get_byte(${requestLink.tokenEnc}, 0) <> ${v}`))
          .orderBy(asc(requestLink.id))
          .limit(batchSize),
      );
      if (rows.length === 0) break;
      let changed = 0;
      for (const r of rows) {
        const tokNew = reseal(r.tokenEnc, 'request_link.token', org, r.id, 'request_link', ring);
        const n = await withOrg(org, async (tx) => {
          const upd = await tx
            .update(requestLink)
            .set({ tokenEnc: tokNew })
            .where(and(eq(requestLink.id, r.id), eq(requestLink.orgId, org), eq(requestLink.tokenEnc, r.tokenEnc)))
            .returning({ id: requestLink.id });
          return upd.length;
        });
        changed += n;
        result.requestLinks += n;
      }
      if (changed === 0) break;
    }
  }
  return result;
}
