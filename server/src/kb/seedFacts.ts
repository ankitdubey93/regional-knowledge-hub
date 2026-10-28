import { eq } from 'drizzle-orm';
import type { Fact } from '@chub/shared/data/schemas';
import { db } from '../db/client';
import { kbFact } from '../db/schema';
import { recordAudit } from '../services/auditService';
import { writeFactInTx } from '../services/factService';
import { rowToFact } from '../services/kbService';
import { SEED_ACTOR } from './curriculum';
import { checkFactSave, factsEqual } from './factRules';

export interface FactSeedReport { created: number; updated: number; unchanged: number; skipped: string[] }

/** Inserts missing facts; updates one only if kb_fact.updated_by = SEED_ACTOR and it differs; a fact edited in the admin is skipped (key listed). Blocks throw. */
export async function seedFacts(facts: Record<string, Fact>, today: string): Promise<FactSeedReport> {
  const report: FactSeedReport = { created: 0, updated: 0, unchanged: 0, skipped: [] };
  for (const [key, f] of Object.entries(facts)) {
    const row = (await db.select().from(kbFact).where(eq(kbFact.key, key)).limit(1))[0];
    const prev = row ? rowToFact(row) : null;
    if (prev && factsEqual(prev, f)) {
      report.unchanged += 1;
      continue;
    }
    if (row && row.updatedBy !== SEED_ACTOR) {
      report.skipped.push(key);
      continue;
    }
    const issues = checkFactSave(prev, f, today);
    if (issues.length > 0) throw new Error(`Fact ${key}: ${issues.map((i) => i.message).join('; ')}`);
    await db.transaction((tx) => writeFactInTx(tx, SEED_ACTOR, key, prev, f, 'Seeded from shared/seed/facts.json'));
    if (prev) report.updated += 1;
    else report.created += 1;
  }
  await recordAudit(db, {
    actorId: SEED_ACTOR,
    action: 'kb.seed',
    targetType: 'kb',
    targetId: 'facts',
    detail: { created: report.created, updated: report.updated, unchanged: report.unchanged, skipped: report.skipped.length },
  });
  return report;
}
