import { db } from '../db/client';
import { kbFact } from '../db/schema';
import { currentEmbedder, EmbeddingError } from '../ai/embed';
import { MAX_ANSWER_TOKENS, type ChatProvider } from '../ai/chat';
import type { UsageTokens } from '../ai/pricing';
import { checkGrounding } from '../chat/grounding';
import { isCovered } from '../chat/coverage';
import { buildPrompt, type PromptSource } from '../chat/prompt';
import { buildLedgerSources, isLedgerQuestion, ledgerAccountNames, redactQuestionAndNames } from '../chat/ledgerSources';
import { searchKbForChat } from '../kb/retrieve';
import { createRestorer, redactWith } from '../privacy/redact';
import { restoreCitation, restoreMessageView } from '../chat/restoreView';
import { NOT_COVERED_REPLY } from '../../../src/lib/chatWire';
import { formatFact } from '../../../src/data/factFormat';
import type { ChatMessageView, CitationView, GroundingFlag, MessageStatus } from '../../../src/lib/chatWire';
import { ledgerChatContext } from './ledgerService';
import {
  conversationContext,
  historyFor,
  insertAssistantMessage,
  insertUserMessage,
  listAttachedDocuments,
  withRedactionMap,
} from './conversationService';
import { openDocumentTexts } from './documentService';
import { rowToFact } from './kbService';
import { recordUsage } from './usageService';

// Only redacted text reaches the embedder, retrieval and the provider (Hard rule 13). Nothing here logs a body.
// No database transaction is open while the embedder or the provider runs.

export interface ExchangeIo {
  start(userMessage: ChatMessageView): void;
  sources(sources: CitationView[]): void;
  delta(text: string): void;
  done(message: ChatMessageView): void;
  signal: AbortSignal; // aborted when the client disconnects
}

const EXCERPT_CHARS = 600;
const PLACEHOLDER = /\[[A-Z]+_\d+\]/g;

/** Caller has already checked the conversation exists, a provider is configured and the guard passed. Never throws for provider failures; throws only when the database fails. */
export async function runExchange(
  orgId: string,
  userId: string,
  conversationId: string,
  text: string,
  provider: ChatProvider,
  io: ExchangeIo,
  now: Date,
): Promise<void> {
  // 1
  const ctx = await conversationContext(orgId, conversationId);
  if (!ctx) throw new Error('conversation not found');
  const userMessage = await insertUserMessage(orgId, userId, conversationId, text);
  io.start(userMessage);

  // 2
  const names = ctx.names;
  const ledger = ctx.client ? await ledgerChatContext(orgId, ctx.client.id) : null;
  const rawNames = ledger ? ledgerAccountNames(ledger.current, ledger.prior) : new Map<string, string>();
  const rawHistory = await historyFor(orgId, conversationId);
  const accountNameList = [...rawNames.values()];
  // Attached documents are opened in their own short transactions, before the map transaction (never held during a provider call).
  const attached = ctx.client ? await listAttachedDocuments(orgId, conversationId) : [];
  const rawDocs = await openDocumentTexts(orgId, attached.map((d) => d.id));
  const redacted = await withRedactionMap(orgId, conversationId, (m0) => {
    const red = redactQuestionAndNames(text, accountNameList, names, m0);
    let map = red.map;
    const hist: { role: 'user' | 'assistant'; text: string }[] = [];
    for (const t of rawHistory) {
      const r = redactWith(t.text, { names }, map);
      map = r.map;
      hist.push({ role: t.role, text: r.text });
    }
    const docs: { label: string; name: string; text: string }[] = [];
    for (const [i, d] of rawDocs.entries()) {
      const n = redactWith(d.name, { names }, map);
      map = n.map;
      const t = redactWith(d.text, { names }, map);
      map = t.map;
      docs.push({ label: `D${i + 1}`, name: n.text, text: t.text });
    }
    return { map, result: { red, history: hist, docs, map } };
  });
  if (!redacted) throw new Error('conversation not found');
  const { red, history, docs, map } = redacted;
  const question = red.question;
  const displayNames = new Map<string, string>();
  for (const [i, code] of [...rawNames.keys()].entries()) {
    const n = red.accountNames[i];
    if (n === undefined) throw new Error('redaction changed the account name count');
    displayNames.set(code, n);
  }

  // 3
  let jurisdiction: 'AU' | 'UK' | undefined;
  if (ctx.client) {
    jurisdiction = ctx.client.jurisdiction === 'AU' ? 'AU' : ctx.client.jurisdiction === 'UK' ? 'UK' : undefined;
  } else {
    jurisdiction = ctx.conversation.scope === 'AU' ? 'AU' : ctx.conversation.scope === 'UK' ? 'UK' : undefined;
  }

  // 5 (query is needed by 4)
  const query = question.replace(PLACEHOLDER, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);

  // 4
  let embedding: number[] | null = null;
  const embedder = query.length >= 3 ? currentEmbedder() : null;
  if (embedder) {
    try {
      embedding = (await embedder.embed([query], 'RETRIEVAL_QUERY'))[0] ?? null;
    } catch (err) {
      if (!(err instanceof EmbeddingError)) throw err;
      embedding = null;
    }
  }

  // 5, 6
  const retrieval =
    query.length < 3
      ? null
      : await searchKbForChat({ query, jurisdiction, includeBills: true, limit: 8 }, embedding);
  const kbCovered = retrieval !== null && isCovered(retrieval);
  const ledgerAsked = ledger !== null && isLedgerQuestion(question, red.accountNames);
  if (!kbCovered && !ledgerAsked) {
    const message = await insertAssistantMessage(orgId, userId, conversationId, {
      body: NOT_COVERED_REPLY,
      status: 'not_covered',
      flags: [],
      provider: null,
      model: null,
      citations: [],
    });
    io.done(restoreMessageView(message, map));
    return;
  }

  // 7
  const ledgerSources =
    ledgerAsked && ledger && ctx.client
      ? buildLedgerSources({ clientId: ctx.client.id, current: ledger.current, prior: ledger.prior, displayNames })
      : [];
  const results = kbCovered && retrieval ? retrieval.results : [];
  const offset = ledgerSources.length;
  const ledgerCitations: CitationView[] = ledgerSources.map((l, i) => ({
    marker: i + 1,
    sourceId: null,
    versionId: null,
    chunkId: null,
    title: l.title,
    citation: l.citation,
    kind: 'ledger',
    jurisdiction: l.jurisdiction,
    billStatus: null,
    headingPath: [],
    provisionRef: null,
    sitePath: l.sitePath,
    officialUrl: null,
    excerpt: l.excerpt,
    ledger: { importId: l.importId, compareImportId: l.compareImportId, report: l.report, asAt: l.asAt },
  }));
  const kbCitations: CitationView[] = results.map((r, i) => ({
    marker: offset + i + 1,
    sourceId: r.sourceId,
    versionId: r.versionId,
    chunkId: r.chunkId,
    title: r.title,
    citation: r.citation,
    kind: r.kind,
    jurisdiction: r.jurisdiction,
    billStatus: r.billStatus,
    headingPath: r.headingPath,
    provisionRef: r.provisionRef,
    sitePath: r.sitePath,
    officialUrl: r.officialUrl,
    excerpt: r.text.slice(0, EXCERPT_CHARS),
  }));
  const sources: CitationView[] = [...ledgerCitations, ...kbCitations];
  io.sources(sources.map((c) => restoreCitation(c, map)));

  // 8
  const promptSources: PromptSource[] = [
    ...ledgerSources.map((l, i) => ({
      marker: i + 1,
      title: l.title,
      citation: l.citation,
      headingPath: [],
      provisionRef: null,
      isBill: false,
      isLedger: true,
      text: l.text,
    })),
    ...results.map((r, i) => ({
      marker: offset + i + 1,
      title: r.title,
      citation: r.citation,
      headingPath: r.headingPath,
      provisionRef: r.provisionRef,
      isBill: r.kind === 'bill',
      isLedger: false,
      text: r.text,
    })),
  ];
  const prompt = buildPrompt({
    today: now.toISOString().slice(0, 10),
    jurisdiction,
    sources: promptSources,
    documents: docs,
    history,
    question,
  });

  // 9
  const ac = new AbortController();
  const onAbort = (): void => ac.abort();
  if (io.signal.aborted) ac.abort();
  else io.signal.addEventListener('abort', onAbort, { once: true });

  let answer = '';
  const restorer = createRestorer(map);
  const usages: { model: string; tokens: UsageTokens }[] = [];
  let stopReason: 'end' | 'max_tokens' | 'refusal' = 'end';
  let failed = false;
  try {
    for await (const ev of provider.stream({ system: prompt.system, messages: prompt.messages, maxTokens: MAX_ANSWER_TOKENS, signal: ac.signal })) {
      if (ev.type === 'text') {
        answer += ev.text;
        const shown = restorer.push(ev.text);
        if (shown) io.delta(shown);
      } else if (ev.type === 'usage') {
        usages.push({
          model: ev.model,
          tokens: {
            inputTokens: ev.inputTokens,
            outputTokens: ev.outputTokens,
            cacheWriteTokens: ev.cacheWriteTokens,
            cacheReadTokens: ev.cacheReadTokens,
          },
        });
      } else {
        stopReason = ev.reason;
      }
    }
  } catch {
    // A ChatProviderError and any other failure are both stored as an error; the abort case is decided below.
    failed = true;
  } finally {
    const rest = restorer.flush();
    if (rest) io.delta(rest);
    io.signal.removeEventListener('abort', onAbort);
  }
  const aborted = io.signal.aborted;

  // 10
  let status: Exclude<MessageStatus, 'sent'>;
  let flags: GroundingFlag[] = [];
  let citations: CitationView[] = [];
  if (aborted) {
    status = 'stopped';
  } else if (failed) {
    status = 'error';
  } else if (stopReason === 'refusal') {
    status = 'refused';
  } else {
    const factRows = await db.select().from(kbFact);
    const factValues = factRows.map((row) => formatFact(rowToFact(row)));
    const g = checkGrounding(
      answer,
      [
        ...ledgerSources.map((l, i) => ({ marker: i + 1, text: l.text })),
        ...results.map((r, i) => ({ marker: offset + i + 1, text: r.text })),
      ],
      factValues,
      docs.map((d) => d.text),
    );
    status = g.status;
    flags = g.flags;
    citations = sources.filter((s) => g.usedMarkers.includes(s.marker));
  }

  // 11
  if (usages.length > 0) {
    for (const u of usages) {
      await recordUsage({ orgId, userId, provider: provider.name, model: u.model, tokens: u.tokens, estimated: false });
    }
  } else {
    const promptChars = prompt.system.length + prompt.messages.reduce((n, m) => n + m.text.length, 0);
    await recordUsage({
      orgId,
      userId,
      provider: provider.name,
      model: provider.model,
      tokens: {
        inputTokens: Math.ceil(promptChars / 4),
        outputTokens: Math.ceil(answer.length / 4),
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
      },
      estimated: true,
    });
  }

  // 12
  const message = await insertAssistantMessage(orgId, userId, conversationId, {
    body: answer,
    status,
    flags,
    provider: provider.name,
    model: provider.model,
    citations,
  });
  io.done(restoreMessageView(message, map));
}
