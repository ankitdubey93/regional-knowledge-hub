/**
 * The only place the JSON data files are imported. Each is parsed by its zod
 * schema once, at module load, so a malformed file fails loudly (and the
 * data tests fail before the build ships it).
 */
import chartJson from './chart-of-accounts.json';
import taxCodesJson from './tax-codes.json';
import standardsJson from './standards-mapping.json';
import quizzesJson from './quizzes.json';
import flashcardsJson from './flashcards.json';
import journalJson from './journal-scenarios.json';
import codingJson from './coding-scenarios.json';
import checklistsJson from './checklists.json';
import {
  chartSchema,
  checklistsSchema,
  codingScenariosSchema,
  flashcardsSchema,
  journalScenariosSchema,
  quizSchema,
  standardsMappingSchema,
  taxCodesSchema,
  type Account,
  type Jurisdiction,
} from './schemas';

export const chart = chartSchema.parse(chartJson);
export const taxCodes = taxCodesSchema.parse(taxCodesJson);
export const standards = standardsMappingSchema.parse(standardsJson);
export const quizzes = quizSchema.parse(quizzesJson);
export const flashcards = flashcardsSchema.parse(flashcardsJson);
export const journalScenarios = journalScenariosSchema.parse(journalJson);
export const codingScenarios = codingScenariosSchema.parse(codingJson);
export const checklists = checklistsSchema.parse(checklistsJson);

export function accountsFor(j: Jurisdiction): Account[] {
  return chart[j] ?? [];
}

export function accountName(j: Jurisdiction, code: string): string {
  const a = accountsFor(j).find((x) => x.code === code);
  return a ? `${a.code} · ${a.name}` : code;
}
