import { describe, expect, it } from 'vitest';
import { accountsFor, chart, checklists, codingScenarios, flashcards, journalScenarios, quizzes, standards, taxCodes } from '../data';
import { docs, factTokens } from '../content/docs';
import { seedFacts as facts } from './seedData';
import { checkEntry } from '@chub/shared/utils/ledger';

// The docs come from seedData.ts, which globs docs/ the same way the server seed reads it.
const docIds = new Set(docs.map((d) => d.id));

describe('curriculum docs', () => {
  it('has the 14 docs of the blueprint', () => {
    expect(docs).toHaveLength(14);
  });
  it.each(docs.map((d) => [d.id, d] as const))('%s has frontmatter and uses only known facts', (_id, d) => {
    expect(d.title.length).toBeGreaterThan(3);
    expect(d.summary.length).toBeGreaterThan(10);
    for (const key of [...d.facts, ...factTokens(d.body)]) expect(facts[key], `unknown fact ${key}`).toBeDefined();
    expect(d.body).toContain('## Sources');
  });
  it.each(docs.map((d) => [d.id] as const))('%s has quiz questions and flashcards', (id) => {
    expect(quizzes.filter((q) => q.doc === id).length).toBeGreaterThanOrEqual(5);
    expect(flashcards.filter((f) => f.doc === id).length).toBeGreaterThanOrEqual(5);
  });
});

describe('data files', () => {
  it('ids are unique', () => {
    for (const list of [quizzes, flashcards, journalScenarios, codingScenarios]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
  it('every item points at a real doc and real facts', () => {
    for (const x of [...quizzes, ...flashcards, ...journalScenarios, ...codingScenarios, ...checklists]) {
      expect(docIds.has(x.doc), `${x.doc}`).toBe(true);
    }
    for (const x of [...quizzes, ...journalScenarios]) for (const f of x.facts) expect(facts[f], f).toBeDefined();
    for (const t of [...taxCodes.AU, ...taxCodes.UK]) if (t.rateFact) expect(facts[t.rateFact]).toBeDefined();
  });
  it('every journal scenario balances and uses accounts from its chart', () => {
    for (const s of journalScenarios) {
      const lines = s.lines.map((l) => ({ account: l.account, debitCents: l.debit, creditCents: l.credit }));
      expect(checkEntry(lines).problems, s.id).toEqual([]);
      const codes = new Set(accountsFor(s.jurisdiction).map((a) => a.code));
      for (const l of s.lines) expect(codes.has(l.account), `${s.id} ${l.account}`).toBe(true);
    }
  });
  it('every coding answer is a real account and tax code', () => {
    for (const s of codingScenarios) {
      const codes = new Set(chart[s.jurisdiction]!.map((a) => a.code));
      const tax = new Set(taxCodes[s.jurisdiction].map((t) => t.code));
      for (const a of [s.answer, ...s.alsoAccepted]) {
        expect(codes.has(a.account), `${s.id} ${a.account}`).toBe(true);
        expect(tax.has(a.taxCode), `${s.id} ${a.taxCode}`).toBe(true);
      }
    }
  });
  it('account codes are unique within each chart', () => {
    for (const list of Object.values(chart)) expect(new Set(list.map((a) => a.code)).size).toBe(list.length);
  });
  it('the comparison matrix covers the changed-in-2026 topics', () => {
    expect(standards.topics.filter((t) => t.changed2026).map((t) => t.id)).toEqual(['leases', 'revenue']);
  });
  it('every fact that claims to be verified has a date no later than today', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const [key, f] of Object.entries(facts)) if (f.verifiedOn) expect(f.verifiedOn <= today, key).toBe(true);
  });
});
