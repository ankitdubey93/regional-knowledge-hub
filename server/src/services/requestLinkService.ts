// Client request links (C3). Never logs a token, URL, email or label (Hard rule 13). Every tenant query runs in withOrg with an org_id predicate (Hard rule 11).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { formatDay } from '@chub/shared/utils/deadlines';
import { db } from '../db/client';
import { client, documentRequest, organization, requestLink, requestLinkItem } from '../db/schema';
import { withOrg, type Tx } from '../db/withOrg';
import type { DocumentKind } from '../documents/extract';
import { requestLinkMail } from '../mail/templates';
import { sendMail } from '../mail/mailer';
import { aadFor, seal } from '../privacy/crypto';
import {
  LINK_TOKEN_PATTERN,
  type PublicItem,
  type PublicRequestView,
  type RequestLinkCreate,
  type RequestLinkStatus,
  type RequestLinkView,
  type ResolvedLink,
} from '../types/requestLinks';
import { recordEvent, type AuditActor } from './auditEventService';
import { CLIENT_LINK_UPLOADER, uploadDocument } from './documentService';

const DAY_MS = 86_400_000;

export function hashLinkToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export function newLinkToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashLinkToken(token) };
}

/** organization is Better Auth's table, not a tenant table: read only for an orgId the caller already holds. */
export async function firmName(orgId: string): Promise<string | null> {
  const rows = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, orgId)).limit(1);
  return rows[0]?.name ?? null;
}

export function linkStatus(
  v: { revokedAt: Date | null; expiresAt: Date; openItems: number; paused: boolean },
  now: Date,
): RequestLinkStatus {
  if (v.revokedAt !== null) return 'revoked';
  if (v.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (v.openItems === 0) return 'complete';
  if (v.paused) return 'paused';
  return 'active';
}

type LinkRow = typeof requestLink.$inferSelect;

async function viewsFor(tx: Tx, orgId: string, rows: LinkRow[], now: Date): Promise<RequestLinkView[]> {
  if (rows.length === 0) return [];
  const items = await tx
    .select({ linkId: requestLinkItem.linkId, requestId: requestLinkItem.requestId, status: documentRequest.status })
    .from(requestLinkItem)
    .innerJoin(
      documentRequest,
      and(
        eq(documentRequest.id, requestLinkItem.requestId),
        eq(documentRequest.clientId, requestLinkItem.clientId),
        eq(documentRequest.orgId, requestLinkItem.orgId),
      ),
    )
    .where(
      and(
        eq(requestLinkItem.orgId, orgId),
        inArray(
          requestLinkItem.linkId,
          rows.map((r) => r.id),
        ),
      ),
    );
  return rows.map((r) => {
    const mine = items.filter((i) => i.linkId === r.id);
    const openItems = mine.filter((i) => i.status === 'open').length;
    return {
      id: r.id,
      clientId: r.clientId,
      recipientEmail: r.recipientEmail,
      requestIds: mine.map((i) => i.requestId),
      expiresAt: r.expiresAt.toISOString(),
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      paused: r.paused,
      cadenceDays: r.cadenceDays,
      nudgeCount: r.nudgeCount,
      lastNudgedAt: r.lastNudgedAt ? r.lastNudgedAt.toISOString() : null,
      openItems,
      status: linkStatus({ revokedAt: r.revokedAt, expiresAt: r.expiresAt, openItems, paused: r.paused }, now),
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

async function clientExists(tx: Tx, orgId: string, clientId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
    .limit(1);
  return rows.length > 0;
}

export async function listLinks(orgId: string, clientId: string, now: Date): Promise<RequestLinkView[] | null> {
  return withOrg(orgId, async (tx) => {
    if (!(await clientExists(tx, orgId, clientId))) return null;
    const rows = await tx
      .select()
      .from(requestLink)
      .where(and(eq(requestLink.orgId, orgId), eq(requestLink.clientId, clientId)))
      .orderBy(desc(requestLink.createdAt));
    return viewsFor(tx, orgId, rows, now);
  });
}

export type CreateLinkOutcome = { link: RequestLinkView; token: string } | { notFound: true } | { badRequests: true };

export async function createLink(
  orgId: string,
  actor: AuditActor,
  clientId: string,
  input: RequestLinkCreate,
  now: Date,
): Promise<CreateLinkOutcome> {
  const id = randomUUID();
  const { token, hash } = newLinkToken();
  const tokenEnc = seal(Buffer.from(token, 'utf8'), aadFor('request_link.token', orgId, id));
  const expiresAt = new Date(now.getTime() + input.expiresInDays * DAY_MS);

  const outcome = await withOrg(orgId, async (tx): Promise<{ link: RequestLinkView } | { notFound: true } | { badRequests: true }> => {
    if (!(await clientExists(tx, orgId, clientId))) return { notFound: true };
    const counted = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(documentRequest)
      .where(
        and(
          eq(documentRequest.orgId, orgId),
          eq(documentRequest.clientId, clientId),
          eq(documentRequest.status, 'open'),
          inArray(documentRequest.id, input.requestIds),
        ),
      );
    if ((counted[0]?.n ?? 0) !== input.requestIds.length) return { badRequests: true };
    const inserted = await tx
      .insert(requestLink)
      .values({
        id,
        orgId,
        clientId,
        tokenHash: hash,
        tokenEnc,
        recipientEmail: input.recipientEmail,
        expiresAt,
        cadenceDays: input.cadenceDays,
        createdBy: actor.userId,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error('insert returned no row');
    await tx
      .insert(requestLinkItem)
      .values(input.requestIds.map((requestId) => ({ orgId, clientId, linkId: id, requestId })));
    await recordEvent(tx, {
      orgId,
      actorId: actor.userId,
      ipKey: actor.ipKey,
      action: 'request_link.create',
      targetType: 'request_link',
      targetId: id,
      detail: { clientId, items: input.requestIds.length, expiresInDays: input.expiresInDays },
    });
    const views = await viewsFor(tx, orgId, [row], now);
    const view = views[0];
    if (!view) throw new Error('view missing');
    return { link: view };
  });
  if ('link' in outcome) return { link: outcome.link, token };
  return outcome;
}

export async function sendLinkEmail(orgId: string, link: RequestLinkView, url: string): Promise<boolean> {
  const name = (await firmName(orgId)) ?? 'Your accountant';
  try {
    await sendMail({ to: link.recipientEmail, ...requestLinkMail(name, url, formatDay(link.expiresAt.slice(0, 10))) });
    return true;
  } catch {
    console.error('request_link mail', { ok: false });
    return false;
  }
}

export type PauseOutcome = { link: RequestLinkView } | { notFound: true } | { revoked: true };

export async function setLinkPaused(
  orgId: string,
  actor: AuditActor,
  clientId: string,
  linkId: string,
  paused: boolean,
  now: Date,
): Promise<PauseOutcome> {
  return withOrg(orgId, async (tx): Promise<PauseOutcome> => {
    const rows = await tx
      .select()
      .from(requestLink)
      .where(and(eq(requestLink.id, linkId), eq(requestLink.clientId, clientId), eq(requestLink.orgId, orgId)))
      .limit(1);
    const row = rows[0];
    if (!row) return { notFound: true };
    if (row.revokedAt !== null) return { revoked: true };
    let current = row;
    if (row.paused !== paused) {
      const updated = await tx
        .update(requestLink)
        .set({ paused })
        .where(and(eq(requestLink.id, linkId), eq(requestLink.clientId, clientId), eq(requestLink.orgId, orgId)))
        .returning();
      current = updated[0] ?? row;
      await recordEvent(tx, {
        orgId,
        actorId: actor.userId,
        ipKey: actor.ipKey,
        action: paused ? 'request_link.pause' : 'request_link.resume',
        targetType: 'request_link',
        targetId: linkId,
        detail: { clientId },
      });
    }
    const views = await viewsFor(tx, orgId, [current], now);
    const view = views[0];
    if (!view) throw new Error('view missing');
    return { link: view };
  });
}

export async function revokeLink(orgId: string, actor: AuditActor, clientId: string, linkId: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const exists = await tx
      .select({ id: requestLink.id })
      .from(requestLink)
      .where(and(eq(requestLink.id, linkId), eq(requestLink.clientId, clientId), eq(requestLink.orgId, orgId)))
      .limit(1);
    if (exists.length === 0) return false;
    const changed = await tx
      .update(requestLink)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(requestLink.id, linkId),
          eq(requestLink.clientId, clientId),
          eq(requestLink.orgId, orgId),
          sql`${requestLink.revokedAt} is null`,
        ),
      )
      .returning({ id: requestLink.id });
    if (changed.length > 0) {
      await recordEvent(tx, {
        orgId,
        actorId: actor.userId,
        ipKey: actor.ipKey,
        action: 'request_link.revoke',
        targetType: 'request_link',
        targetId: linkId,
        detail: { clientId },
      });
    }
    return true;
  });
}

/** The only tenant read outside withOrg: request_link_resolve (SECURITY DEFINER) returns one row for a live token. */
export async function resolveLink(token: string): Promise<ResolvedLink | null> {
  if (!LINK_TOKEN_PATTERN.test(token)) return null;
  const result = await db.execute(
    sql`select org_id, client_id, link_id from request_link_resolve(${hashLinkToken(token)})`,
  );
  const row = result.rows[0] as { org_id: string; client_id: string; link_id: string } | undefined;
  return row ? { orgId: row.org_id, clientId: row.client_id, linkId: row.link_id } : null;
}

async function itemsOf(tx: Tx, r: ResolvedLink): Promise<{ id: string; label: string; status: 'open' | 'received' | 'waived' }[]> {
  return tx
    .select({ id: documentRequest.id, label: documentRequest.label, status: documentRequest.status })
    .from(requestLinkItem)
    .innerJoin(
      documentRequest,
      and(
        eq(documentRequest.id, requestLinkItem.requestId),
        eq(documentRequest.clientId, requestLinkItem.clientId),
        eq(documentRequest.orgId, requestLinkItem.orgId),
      ),
    )
    .where(
      and(
        eq(requestLinkItem.orgId, r.orgId),
        eq(requestLinkItem.clientId, r.clientId),
        eq(requestLinkItem.linkId, r.linkId),
        inArray(documentRequest.status, ['open', 'received']),
      ),
    )
    .orderBy(sql`${documentRequest.dueOn} asc nulls last`, asc(documentRequest.label));
}

export async function publicView(r: ResolvedLink): Promise<PublicRequestView | null> {
  const name = await firmName(r.orgId);
  if (name === null) return null;
  return withOrg(r.orgId, async (tx) => {
    const links = await tx
      .select({ expiresAt: requestLink.expiresAt })
      .from(requestLink)
      .where(and(eq(requestLink.id, r.linkId), eq(requestLink.orgId, r.orgId)))
      .limit(1);
    const link = links[0];
    if (!link) return null;
    const items = await itemsOf(tx, r);
    return {
      firmName: name,
      expiresOn: link.expiresAt.toISOString().slice(0, 10),
      items: items.map((i) => ({ id: i.id, label: i.label, received: i.status === 'received' })),
    };
  });
}

export async function publicItem(r: ResolvedLink, requestId: string): Promise<PublicItem | null> {
  return withOrg(r.orgId, async (tx) => {
    const items = await itemsOf(tx, r);
    const found = items.find((i) => i.id === requestId);
    return found ? { id: found.id, label: found.label, received: found.status === 'received' } : null;
  });
}

export type LinkUploadOutcome = { item: PublicItem; created: boolean } | { notOnLink: true } | { full: true };

export async function uploadForRequest(
  r: ResolvedLink,
  ipKey: string | null,
  requestId: string,
  input: { name: string; kind: DocumentKind; bytes: Uint8Array; text: string; truncated: boolean },
): Promise<LinkUploadOutcome> {
  const item = await publicItem(r, requestId);
  if (!item) return { notOnLink: true };
  const outcome = await uploadDocument(
    r.orgId,
    { userId: CLIENT_LINK_UPLOADER, ipKey },
    r.clientId,
    input,
    { linkId: r.linkId, requestId },
  );
  if ('notFound' in outcome) return { notOnLink: true };
  if ('full' in outcome) return { full: true };
  return { item: { ...item, received: true }, created: outcome.created };
}
