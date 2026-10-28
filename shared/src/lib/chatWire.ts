import { z } from 'zod';

// Shared by the web and the server: the chat API's wire shapes. Pure: zod only, no DOM, no fetch.

export const CHAT_SCOPES = ['AU', 'UK', 'ALL'] as const;
export const MESSAGE_ROLES = ['user', 'assistant'] as const;
export const MESSAGE_STATUSES = ['sent', 'answered', 'flagged', 'not_covered', 'refused', 'stopped', 'error'] as const;
export const FLAG_CODES = ['uncited', 'bad_marker', 'unsupported_number', 'from_document'] as const;
export const NOT_COVERED_REPLY = "The Knowledge Hub doesn't cover this yet, so I can't answer it. Try rephrasing the question, or browse the guides.";
export const NOT_IN_SOURCES = "The Knowledge Hub sources I was given don't cover this.";

export const chatScopeSchema = z.enum(CHAT_SCOPES);
export const groundingFlagSchema = z.object({ code: z.enum(FLAG_CODES), detail: z.string() });
export const ledgerCitationRefSchema = z.object({
  importId: z.string(),
  compareImportId: z.string().nullable(),
  report: z.enum(['pnl', 'bs']),
  asAt: z.string(),
});
export const citationViewSchema = z.object({
  marker: z.number().int().min(1),
  sourceId: z.string().nullable(), versionId: z.string().nullable(), chunkId: z.string().nullable(),
  title: z.string(), citation: z.string(),
  kind: z.enum(['act', 'regulation', 'bill', 'ruling', 'guidance', 'standard', 'curriculum', 'ledger']),
  jurisdiction: z.enum(['AU', 'UK', 'INTL']),
  billStatus: z.enum(['introduced', 'passed', 'assented', 'lapsed']).nullable(),
  headingPath: z.array(z.string()),
  provisionRef: z.string().nullable(),
  sitePath: z.string().nullable(),
  officialUrl: z.string().nullable(),
  excerpt: z.string(),
  ledger: ledgerCitationRefSchema.optional(),
});
export const chatMessageViewSchema = z.object({
  id: z.string(), role: z.enum(MESSAGE_ROLES), body: z.string(), status: z.enum(MESSAGE_STATUSES),
  flags: z.array(groundingFlagSchema), createdAt: z.string(), citations: z.array(citationViewSchema),
});
export const attachedDocumentSchema = z.object({
  id: z.string(), originalName: z.string(),
  kind: z.enum(['pdf', 'docx', 'xlsx', 'csv', 'text', 'markdown']),
  truncated: z.boolean(),
});
export const conversationViewSchema = z.object({
  id: z.string(), clientId: z.string().nullable(), scope: chatScopeSchema.nullable(), title: z.string(),
  createdBy: z.string(), createdAt: z.string(), updatedAt: z.string(),
  documents: z.array(attachedDocumentSchema),
});
export const chatStatusSchema = z.object({ configured: z.boolean(), provider: z.string(), model: z.string().nullable(), embeddings: z.boolean() });
export const sseStartSchema = z.object({ userMessage: chatMessageViewSchema });
export const sseSourcesSchema = z.object({ sources: z.array(citationViewSchema) });
export const sseDeltaSchema = z.object({ text: z.string() });
export const sseDoneSchema = z.object({ message: chatMessageViewSchema });
export const sseErrorSchema = z.object({ error: z.string() });

export type ChatScope = z.infer<typeof chatScopeSchema>;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
export type GroundingFlag = z.infer<typeof groundingFlagSchema>;
export type CitationView = z.infer<typeof citationViewSchema>;
export type LedgerCitationRef = z.infer<typeof ledgerCitationRefSchema>;
export type ChatMessageView = z.infer<typeof chatMessageViewSchema>;
export type AttachedDocument = z.infer<typeof attachedDocumentSchema>;
export type ConversationView = z.infer<typeof conversationViewSchema>;
export type ChatStatus = z.infer<typeof chatStatusSchema>;

export interface SseEvent { event: string; data: string }

/** Removes exactly one leading space, if present. */
function stripOneSpace(value: string): string {
  return value.startsWith(' ') ? value.slice(1) : value;
}

/** Splits a text/event-stream buffer into complete events plus the unfinished remainder. */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const pieces = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = pieces.pop() ?? '';
  const events: SseEvent[] = [];
  for (const block of pieces) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        event = stripOneSpace(line.slice('event:'.length));
        continue;
      }
      if (line.startsWith('data:')) data.push(stripOneSpace(line.slice('data:'.length)));
    }
    if (data.length > 0) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}
