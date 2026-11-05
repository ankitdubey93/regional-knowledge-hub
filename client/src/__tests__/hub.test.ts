import { describe, expect, it } from 'vitest';
import { flagText, linkMarkers, practiceBadge, statusBadge } from '../lib/chat';
import type { CitationView } from '@chub/shared/lib/chatWire';
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

describe('chat helpers', () => {
  it('CH1 linkMarkers links single and grouped markers', () => {
    expect(linkMarkers('A [1]. B [1, 2].', 'm1')).toBe('A [[1]](#cite-m1-1). B [[1]](#cite-m1-1) [[2]](#cite-m1-2).');
  });

  it('CH2 linkMarkers leaves placeholders', () => {
    expect(linkMarkers('Ask [NAME_1]', 'm1')).toBe('Ask [NAME_1]');
  });

  it('CH3 flagText', () => {
    expect(flagText({ code: 'unsupported_number', detail: '12.5%' })).toBe('It uses a number not found in its sources: 12.5%.');
  });

  it('CH4 statusBadge', () => {
    expect(statusBadge('flagged')).toBe('Check this answer');
    expect(statusBadge('answered')).toBeNull();
  });

  it('CH5 practiceBadge', () => {
    const base: CitationView = {
      marker: 1,
      sourceId: null,
      versionId: null,
      chunkId: null,
      title: 'Open engagements',
      citation: 'Engagements, as of 2026-11-04 09:30 UTC',
      kind: 'practice',
      jurisdiction: 'AU',
      billStatus: null,
      headingPath: [],
      provisionRef: null,
      sitePath: '/engagements',
      officialUrl: null,
      excerpt: 'x',
      practice: {
        kind: 'open_engagements',
        params: { clientId: null, days: null, weekStart: null },
        asOf: '2026-11-04T09:30:00.000Z',
      },
    };
    expect(practiceBadge(base)).toBe('Your practice: as of 2026-11-04 09:30 UTC');
    const { practice: _omitted, ...withoutRef } = base;
    expect(practiceBadge(withoutRef)).toBe('Your practice');
    expect(practiceBadge({ ...base, kind: 'ledger' })).toBeNull();
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
