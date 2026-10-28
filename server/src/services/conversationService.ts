import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { chatCitation, chatMessage, client, conversation } from '../db/schema';
import { withOrg } from '../db/withOrg';
import type { ConversationRow } from '../types/chat';
import type { Client } from '../types/clients';
import type { FirmRole } from '../types';
import { stripMarkers } from '../chat/prompt';
import type {
  ChatMessageView,
  ChatScope,
  CitationView,
  ConversationView,
  GroundingFlag,
  MessageStatus,
} from '../../../src/lib/chatWire';

// Every function runs inside withOrg (RLS) and keeps an explicit org_id predicate (Hard rule 11).
// Nothing here logs message bodies (Hard rule 13).

type MessageRow = typeof chatMessage.$inferSelect;
type CitationRow = typeof chatCitation.$inferSelect;

export function toConversationView(r: ConversationRow): ConversationView {
  return {
    id: r.id,
    clientId: r.clientId,
    scope: r.scope,
    title: r.title,
    createdBy: r.userId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toCitationView(c: CitationRow): CitationView {
  return {
    marker: c.marker,
    sourceId: c.sourceId,
    versionId: c.versionId,
    chunkId: c.chunkId,
    title: c.title,
    citation: c.citation,
    kind: c.kind as CitationView['kind'],
    jurisdiction: c.jurisdiction as CitationView['jurisdiction'],
    billStatus: c.billStatus as CitationView['billStatus'],
    headingPath: c.headingPath,
    provisionRef: c.provisionRef,
    sitePath: c.sitePath,
    officialUrl: c.officialUrl,
    excerpt: c.excerpt,
    ...(c.ledgerImportId !== null && c.ledgerReport !== null && c.ledgerAsAt !== null
      ? { ledger: { importId: c.ledgerImportId, compareImportId: c.ledgerCompareImportId, report: c.ledgerReport, asAt: c.ledgerAsAt } }
      : {}),
  };
}

function toMessageView(m: MessageRow, citations: CitationRow[]): ChatMessageView {
  return {
    id: m.id,
    role: m.role,
    body: m.body,
    status: m.status,
    flags: m.flags,
    createdAt: m.createdAt.toISOString(),
    citations: citations.filter((c) => c.messageId === m.id).sort((a, b) => a.marker - b.marker).map(toCitationView),
  };
}

export async function listConversations(orgId: string, clientId: string | null): Promise<ConversationView[] | null> {
  return withOrg(orgId, async (tx) => {
    if (clientId !== null) {
      const found = await tx
        .select({ id: client.id })
        .from(client)
        .where(and(eq(client.id, clientId), eq(client.orgId, orgId)))
        .limit(1);
      if (found.length === 0) return null;
    }
    const rows = await tx
      .select()
      .from(conversation)
      .where(
        and(
          eq(conversation.orgId, orgId),
          clientId === null ? sql`${conversation.clientId} is null` : eq(conversation.clientId, clientId),
        ),
      )
      .orderBy(desc(conversation.updatedAt), desc(conversation.id));
    return rows.map(toConversationView);
  });
}

export async function createConversation(
  orgId: string,
  userId: string,
  input: { clientId: string | null; scope: ChatScope | null },
): Promise<ConversationView | null> {
  return withOrg(orgId, async (tx) => {
    if (input.clientId !== null) {
      const found = await tx
        .select({ id: client.id })
        .from(client)
        .where(and(eq(client.id, input.clientId), eq(client.orgId, orgId)))
        .limit(1);
      if (found.length === 0) return null;
    }
    const rows = await tx
      .insert(conversation)
      .values({ orgId, userId, clientId: input.clientId, scope: input.scope })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('conversation insert returned no row');
    return toConversationView(row);
  });
}

export async function getConversation(
  orgId: string,
  id: string,
): Promise<{ conversation: ConversationView; messages: ChatMessageView[] } | null> {
  return withOrg(orgId, async (tx) => {
    const found = await tx
      .select()
      .from(conversation)
      .where(and(eq(conversation.id, id), eq(conversation.orgId, orgId)))
      .limit(1);
    const conv = found[0];
    if (!conv) return null;
    const msgs = await tx
      .select()
      .from(chatMessage)
      .where(and(eq(chatMessage.conversationId, id), eq(chatMessage.orgId, orgId)))
      .orderBy(asc(chatMessage.createdAt), asc(chatMessage.id));
    const cites =
      msgs.length === 0
        ? []
        : await tx
            .select()
            .from(chatCitation)
            .where(and(eq(chatCitation.orgId, orgId), inArray(chatCitation.messageId, msgs.map((m) => m.id))));
    return { conversation: toConversationView(conv), messages: msgs.map((m) => toMessageView(m, cites)) };
  });
}

export type ChangeOutcome = { conversation: ConversationView } | { notFound: true } | { forbidden: true };

function mayChange(actor: { userId: string; role: FirmRole }, conv: ConversationRow): boolean {
  return actor.userId === conv.userId || actor.role === 'owner' || actor.role === 'admin';
}

export async function renameConversation(
  orgId: string,
  actor: { userId: string; role: FirmRole },
  id: string,
  title: string,
): Promise<ChangeOutcome> {
  return withOrg(orgId, async (tx): Promise<ChangeOutcome> => {
    const found = await tx
      .select()
      .from(conversation)
      .where(and(eq(conversation.id, id), eq(conversation.orgId, orgId)))
      .limit(1);
    const conv = found[0];
    if (!conv) return { notFound: true };
    if (!mayChange(actor, conv)) return { forbidden: true };
    const rows = await tx
      .update(conversation)
      .set({ title })
      .where(and(eq(conversation.id, id), eq(conversation.orgId, orgId)))
      .returning();
    const row = rows[0];
    if (!row) return { notFound: true };
    return { conversation: toConversationView(row) };
  });
}

export async function deleteConversation(
  orgId: string,
  actor: { userId: string; role: FirmRole },
  id: string,
): Promise<'deleted' | 'not_found' | 'forbidden'> {
  return withOrg(orgId, async (tx) => {
    const found = await tx
      .select()
      .from(conversation)
      .where(and(eq(conversation.id, id), eq(conversation.orgId, orgId)))
      .limit(1);
    const conv = found[0];
    if (!conv) return 'not_found';
    if (!mayChange(actor, conv)) return 'forbidden';
    await tx.delete(conversation).where(and(eq(conversation.id, id), eq(conversation.orgId, orgId)));
    return 'deleted';
  });
}

/** What the chat flow needs: the conversation, its client (or null), and the names to redact (every client name and `entities` entry in the workspace). */
export async function conversationContext(
  orgId: string,
  id: string,
): Promise<{ conversation: ConversationRow; client: Client | null; names: string[] } | null> {
  return withOrg(orgId, async (tx) => {
    const found = await tx
      .select()
      .from(conversation)
      .where(and(eq(conversation.id, id), eq(conversation.orgId, orgId)))
      .limit(1);
    const conv = found[0];
    if (!conv) return null;
    const clients = await tx.select().from(client).where(eq(client.orgId, orgId));
    const names = new Set<string>();
    for (const c of clients) {
      names.add(c.name);
      for (const e of c.entities) names.add(e);
    }
    const own = conv.clientId === null ? null : (clients.find((c) => c.id === conv.clientId) ?? null);
    return { conversation: conv, client: own, names: [...names] };
  });
}

/** Inserts the user message; on the conversation's first message sets title to the text's first 80 characters; bumps updated_at. */
export async function insertUserMessage(
  orgId: string,
  userId: string,
  conversationId: string,
  text: string,
): Promise<ChatMessageView> {
  return withOrg(orgId, async (tx) => {
    const existing = await tx
      .select({ id: chatMessage.id })
      .from(chatMessage)
      .where(and(eq(chatMessage.conversationId, conversationId), eq(chatMessage.orgId, orgId)))
      .limit(1);
    const rows = await tx
      .insert(chatMessage)
      .values({ orgId, conversationId, role: 'user', status: 'sent', body: text, flags: [], createdBy: userId })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('message insert returned no row');
    await tx
      .update(conversation)
      .set(existing.length === 0 ? { title: text.slice(0, 80), updatedAt: new Date() } : { updatedAt: new Date() })
      .where(and(eq(conversation.id, conversationId), eq(conversation.orgId, orgId)));
    return toMessageView(row, []);
  });
}

export async function insertAssistantMessage(
  orgId: string,
  userId: string,
  conversationId: string,
  m: {
    body: string;
    status: Exclude<MessageStatus, 'sent'>;
    flags: GroundingFlag[];
    provider: string | null;
    model: string | null;
    citations: CitationView[];
  },
): Promise<ChatMessageView> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .insert(chatMessage)
      .values({
        orgId,
        conversationId,
        role: 'assistant',
        status: m.status,
        body: m.body,
        flags: m.flags,
        provider: m.provider,
        model: m.model,
        createdBy: userId,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('message insert returned no row');
    let cites: CitationRow[] = [];
    if (m.citations.length > 0) {
      cites = await tx
        .insert(chatCitation)
        .values(
          m.citations.map((c) => ({
            orgId,
            messageId: row.id,
            marker: c.marker,
            sourceId: c.sourceId,
            versionId: c.versionId,
            chunkId: c.chunkId,
            title: c.title,
            citation: c.citation,
            kind: c.kind,
            jurisdiction: c.jurisdiction,
            billStatus: c.billStatus,
            headingPath: c.headingPath,
            provisionRef: c.provisionRef,
            sitePath: c.sitePath,
            officialUrl: c.officialUrl,
            excerpt: c.excerpt,
            ledgerImportId: c.ledger?.importId ?? null,
            ledgerCompareImportId: c.ledger?.compareImportId ?? null,
            ledgerReport: c.ledger?.report ?? null,
            ledgerAsAt: c.ledger?.asAt ?? null,
          })),
        )
        .returning();
    }
    await tx
      .update(conversation)
      .set({ updatedAt: new Date() })
      .where(and(eq(conversation.id, conversationId), eq(conversation.orgId, orgId)));
    return toMessageView(row, cites);
  });
}

/** The conversation's earlier exchanges as turns (excluding the newest user message): only user messages followed by an answered or flagged reply, with markers stripped from the replies. */
export async function historyFor(
  orgId: string,
  conversationId: string,
): Promise<{ role: 'user' | 'assistant'; text: string }[]> {
  const msgs = await withOrg(orgId, async (tx) =>
    tx
      .select()
      .from(chatMessage)
      .where(and(eq(chatMessage.conversationId, conversationId), eq(chatMessage.orgId, orgId)))
      .orderBy(asc(chatMessage.createdAt), asc(chatMessage.id)),
  );
  const earlier = msgs.slice(0, -1);
  const turns: { role: 'user' | 'assistant'; text: string }[] = [];
  for (let i = 0; i < earlier.length; i++) {
    const u = earlier[i];
    const a = earlier[i + 1];
    if (!u || u.role !== 'user' || !a || a.role !== 'assistant') continue;
    if (a.status !== 'answered' && a.status !== 'flagged') continue;
    turns.push({ role: 'user', text: u.body });
    turns.push({ role: 'assistant', text: stripMarkers(a.body) });
  }
  return turns;
}
