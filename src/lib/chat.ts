// The chat seam. P3 replaces appendExchange's fixed reply with a streaming, cited answer from the knowledge base.
import type { Jurisdiction } from './entity';
import type { HubScope } from './scope';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  notConnected: boolean;
}

export const NOT_CONNECTED_REPLY =
  "The assistant isn't connected yet. When it is, answers will come only from the Knowledge Hub and cite the topics they use.";

/** Trims text. Blank → returns `messages` itself (same reference). Otherwise returns a new array with
 *  { id: makeId(), role: 'user', text: trimmed, notConnected: false } then
 *  { id: makeId(), role: 'assistant', text: NOT_CONNECTED_REPLY, notConnected: true }. */
export function appendExchange(messages: ChatMessage[], text: string, makeId: () => string): ChatMessage[] {
  const trimmed = text.trim();
  if (trimmed === '') return messages;
  return [
    ...messages,
    { id: makeId(), role: 'user', text: trimmed, notConnected: false },
    { id: makeId(), role: 'assistant', text: NOT_CONNECTED_REPLY, notConnected: true },
  ];
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
