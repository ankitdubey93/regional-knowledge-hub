import { describe, expect, it } from 'vitest';
import { appendExchange, NOT_CONNECTED_REPLY, type ChatMessage } from '../lib/chat';
import { parseActiveEntity } from '../lib/activeEntity';
import { frameworksFor, inScope, scopeFor, scopeName, type HubScope } from '../lib/scope';

describe('scope', () => {
  it('maps an entity jurisdiction to a scope', () => {
    expect(scopeFor('AU')).toBe('AU');
    expect(scopeFor('UK')).toBe('UK');
    expect(scopeFor('AU+UK')).toBe('all');
  });

  it('keeps international and dual content in every scope', () => {
    const scopes: HubScope[] = ['AU', 'UK', 'all'];
    for (const s of scopes) {
      expect(inScope('INTL', s)).toBe(true);
      expect(inScope('AU+UK', s)).toBe(true);
    }
  });

  it('hides the other country', () => {
    expect(inScope('AU', 'UK')).toBe(false);
    expect(inScope('UK', 'AU')).toBe(false);
    expect(inScope('AU', 'AU')).toBe(true);
    expect(inScope('UK', 'all')).toBe(true);
  });

  it('picks the frameworks for a scope', () => {
    expect(frameworksFor('AU')).toEqual(['ifrs', 'aasb']);
    expect(frameworksFor('UK')).toEqual(['ifrs', 'frs102', 'frs105']);
    expect(frameworksFor('all')).toEqual(['ifrs', 'frs102', 'frs105', 'aasb']);
  });

  it('names a scope', () => {
    expect(scopeName('AU')).toBe('Australia');
    expect(scopeName('UK')).toBe('the UK');
    expect(scopeName('all')).toBe('Australia and the UK');
  });
});

describe('appendExchange', () => {
  it('ignores blank input', () => {
    const before: ChatMessage[] = [];
    expect(appendExchange(before, '   ', () => 'x')).toBe(before);
  });

  it('appends the question and the not-connected reply', () => {
    let n = 0;
    const next = () => String(++n);
    expect(appendExchange([], '  Hi  ', next)).toEqual([
      { id: '1', role: 'user', text: 'Hi', notConnected: false },
      { id: '2', role: 'assistant', text: NOT_CONNECTED_REPLY, notConnected: true },
    ]);
  });
});

describe('parseActiveEntity', () => {
  it('returns null for missing or broken values', () => {
    expect(parseActiveEntity(null)).toBeNull();
    expect(parseActiveEntity('not json')).toBeNull();
    expect(parseActiveEntity('{"id":"c1"}')).toBeNull();
  });

  it('reads a stored entity', () => {
    const raw = JSON.stringify({ workspaceId: 'org1', id: 'c1', name: 'Acme Pty Ltd', jurisdiction: 'AU' });
    expect(parseActiveEntity(raw)).toEqual({ workspaceId: 'org1', id: 'c1', name: 'Acme Pty Ltd', jurisdiction: 'AU' });
  });
});
