import type { ChatMessageView, CitationView } from '../../../src/lib/chatWire';
import { restore, type RedactionMap } from '../privacy/redact';

// Pure. Puts the reader's own details back into text that is stored and sent with placeholders.
// Only ever applied to responses for a signed-in member of the firm (P4).

export function restoreCitation(c: CitationView, map: RedactionMap): CitationView {
  return { ...c, excerpt: restore(c.excerpt, map), title: restore(c.title, map), citation: restore(c.citation, map) };
}

export function restoreMessageView(m: ChatMessageView, map: RedactionMap): ChatMessageView {
  if (m.role !== 'assistant') return m;
  return { ...m, body: restore(m.body, map), citations: m.citations.map((c) => restoreCitation(c, map)) };
}
