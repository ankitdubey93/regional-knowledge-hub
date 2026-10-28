// The chat client: typed calls to /api/conversations and the SSE reader. Answers come only from the knowledge base (Hard rule 12).
import { z } from 'zod';
import type { Jurisdiction } from './entity';
import type { HubScope } from './scope';
import { apiDelete, apiJson, ApiError, failure } from './api';
import {
  attachedDocumentSchema,
  chatMessageViewSchema,
  chatStatusSchema,
  conversationViewSchema,
  parseSse,
  sseDeltaSchema,
  sseDoneSchema,
  sseErrorSchema,
  sseSourcesSchema,
  sseStartSchema,
  type AttachedDocument,
  type ChatMessageView,
  type ChatScope,
  type ChatStatus,
  type CitationView,
  type ConversationView,
  type GroundingFlag,
  type MessageStatus,
} from '@chub/shared/lib/chatWire';

const MARKER_PATTERN = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

const conversationResponseSchema = z.object({ conversation: conversationViewSchema });
const conversationListSchema = z.object({ conversations: z.array(conversationViewSchema) });
const conversationDetailSchema = z.object({ conversation: conversationViewSchema, messages: z.array(chatMessageViewSchema) });
const attachedDocumentsSchema = z.object({ documents: z.array(attachedDocumentSchema) });

/** "[1]" → "[[1]](#cite-<id>-1)"; "[1, 2]" → "[[1]](#cite-<id>-1) [[2]](#cite-<id>-2)"; placeholders like [NAME_1] untouched. */
export function linkMarkers(body: string, messageId: string): string {
  return body.replace(MARKER_PATTERN, (_match, group: string) =>
    group
      .split(',')
      .map((n) => n.trim())
      .map((n) => `[[${n}]](#cite-${messageId}-${n})`)
      .join(' '),
  );
}

export function flagText(f: GroundingFlag): string {
  switch (f.code) {
    case 'uncited':
      return 'Part of this answer has no citation.';
    case 'bad_marker':
      return `It cites a source that wasn't provided (${f.detail}).`;
    case 'unsupported_number':
      return `It uses a number not found in its sources: ${f.detail}.`;
    case 'from_document':
      return `It uses a figure from an attached document, not from a checked source: ${f.detail}.`;
  }
}

export function statusBadge(s: MessageStatus): string | null {
  switch (s) {
    case 'not_covered':
      return 'Not covered';
    case 'flagged':
      return 'Check this answer';
    case 'refused':
      return 'Declined';
    case 'stopped':
      return 'Stopped';
    case 'error':
      return 'Failed';
    case 'sent':
    case 'answered':
      return null;
  }
}

export function hubSuggestions(scope: HubScope): string[] {
  if (scope === 'AU') {
    return ['How do I code a bill that includes GST?', 'What is the difference between cash and accrual GST reporting?', 'Which BAS labels cover sales?'];
  }
  if (scope === 'UK') {
    return ['How do I code a bill that includes VAT?', 'What does Making Tax Digital require for VAT?', 'Which VAT return boxes cover sales?'];
  }
  return ['How do GST and VAT differ?', 'What is double entry?', 'How do FRS 102 and IFRS treat leases?'];
}

export function entitySuggestions(j: Jurisdiction): string[] {
  if (j === 'AU') {
    return ['What does this entity lodge each quarter?', 'Which GST code does a bill from an overseas supplier use?', 'What goes into the month-end close for this entity?'];
  }
  if (j === 'UK') {
    return ['What does this entity file each quarter?', 'Which VAT treatment does a bill from an overseas supplier get?', 'What goes into the month-end close for this entity?'];
  }
  return ['How do GST and VAT differ for this entity?', 'What does this entity file in each country?', 'What goes into the month-end close for this entity?'];
}

export async function getChatStatus(): Promise<ChatStatus> {
  return chatStatusSchema.parse(await apiJson<unknown>('/chat/status'));
}

export async function listConversations(clientId: string | null): Promise<ConversationView[]> {
  const query = encodeURIComponent(clientId ?? 'none');
  const body = conversationListSchema.parse(await apiJson<unknown>(`/conversations?clientId=${query}`));
  return body.conversations;
}

export async function createConversation(input: { clientId: string | null; scope: ChatScope | null }): Promise<ConversationView> {
  const body = conversationResponseSchema.parse(await apiJson<unknown>('/conversations', { method: 'POST', body: input }));
  return body.conversation;
}

export async function getConversation(id: string): Promise<{ conversation: ConversationView; messages: ChatMessageView[] }> {
  return conversationDetailSchema.parse(await apiJson<unknown>(`/conversations/${encodeURIComponent(id)}`));
}

export async function renameConversation(id: string, title: string): Promise<ConversationView> {
  const body = conversationResponseSchema.parse(
    await apiJson<unknown>(`/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', body: { title } }),
  );
  return body.conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  await apiDelete(`/conversations/${encodeURIComponent(id)}`);
}

export interface StreamHandlers {
  onStart(m: ChatMessageView): void;
  onSources(s: CitationView[]): void;
  onDelta(t: string): void;
  onDone(m: ChatMessageView): void;
  onError(message: string): void;
}

function dispatch(event: string, data: string, h: StreamHandlers): void {
  switch (event) {
    case 'start':
      h.onStart(sseStartSchema.parse(JSON.parse(data)).userMessage);
      return;
    case 'sources':
      h.onSources(sseSourcesSchema.parse(JSON.parse(data)).sources);
      return;
    case 'delta':
      h.onDelta(sseDeltaSchema.parse(JSON.parse(data)).text);
      return;
    case 'done':
      h.onDone(sseDoneSchema.parse(JSON.parse(data)).message);
      return;
    case 'error':
      h.onError(sseErrorSchema.parse(JSON.parse(data)).error);
      return;
    default:
      return;
  }
}

/** POST /api/conversations/:id/messages; reads the event stream with parseSse; zod-parses each event. A non-OK response throws `await failure(res)`. */
export async function streamMessage(id: string, text: string, h: StreamHandlers, signal: AbortSignal): Promise<void> {
  const res = await fetch(`/api/conversations/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw await failure(res);
  if (res.body === null) throw new ApiError(res.status, 'The answer could not be read.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    for (const ev of parsed.events) dispatch(ev.event, ev.data, h);
  }
  // Flush: complete any final event the server ended without a blank line.
  buffer += decoder.decode();
  for (const ev of parseSse(buffer + '\n\n').events) dispatch(ev.event, ev.data, h);
}

/** POST /api/conversations/:id/documents with { documentId }; returns the chat's attached documents. */
export async function attachDocument(id: string, documentId: string): Promise<AttachedDocument[]> {
  const body = attachedDocumentsSchema.parse(
    await apiJson<unknown>(`/conversations/${encodeURIComponent(id)}/documents`, { method: 'POST', body: { documentId } }),
  );
  return body.documents;
}

/** DELETE /api/conversations/:id/documents/:documentId. A raw fetch, because apiDelete returns void and the server sends the list back. */
export async function detachDocument(id: string, documentId: string): Promise<AttachedDocument[]> {
  const res = await fetch(
    `/api/conversations/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE', credentials: 'include' },
  );
  if (!res.ok) throw await failure(res);
  const body: unknown = await res.json();
  return attachedDocumentsSchema.parse(body).documents;
}
