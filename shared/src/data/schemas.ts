import { z } from 'zod';
import { OBLIGATION_KINDS } from '../utils/deadlines';
import { ENGAGEMENT_KINDS } from '../utils/engagements';

export const jurisdiction = z.enum(['AU', 'UK', 'INTL']);
export type Jurisdiction = z.infer<typeof jurisdiction>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A doc id is its path under docs/ without the extension, e.g. "australia/bas-gst-guide". */
const docId = z.string().regex(/^[a-z-]+\/[a-z0-9-]+$/);

export const factSchema = z
  .object({
    label: z.string().min(3),
    jurisdiction,
    unit: z.enum(['bp', 'cents', 'count', 'date', 'text']),
    value: z.union([z.number().int(), z.string().min(1)]),
    effectiveFrom: isoDate,
    source: z.url(),
    verifiedOn: isoDate.nullable(),
    note: z.string().optional(),
  })
  .refine((f) => (f.unit === 'text' || f.unit === 'date' ? typeof f.value === 'string' : typeof f.value === 'number'), {
    message: 'bp, cents and count facts are integers; date and text facts are strings',
  })
  .refine((f) => f.unit !== 'date' || /^\d{4}-\d{2}-\d{2}$/.test(String(f.value)), { message: 'a date fact is yyyy-mm-dd' });
export const factKeySchema = z.string().regex(/^(au|uk|intl)\.[a-zA-Z0-9.]+$/);
export const sectionSchema = z.enum(['core-accounting', 'standards', 'australia', 'uk']);
export const curriculumMetaSchema = z.object({
  section: sectionSchema,
  slug: z.string().regex(/^[a-z0-9-]+$/),
  summary: z.string(),
  jurisdiction: z.enum(['AU', 'UK', 'INTL', 'AU+UK']),
  level: z.enum(['beginner', 'intermediate']),
  order: z.number().int(),
  facts: z.array(z.string()),
  tools: z.array(z.string()),
});
export type CurriculumMeta = z.infer<typeof curriculumMetaSchema>;
export const siteDocSchema = curriculumMetaSchema.extend({ id: z.string(), title: z.string(), body: z.string() });
export type SiteDoc = z.infer<typeof siteDocSchema>;

export const factsSchema = z.record(factKeySchema, factSchema);
export type Fact = z.infer<typeof factSchema>;

export const accountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
});
export const chartSchema = z.record(jurisdiction, z.array(accountSchema).min(5));
export type Account = z.infer<typeof accountSchema>;

export const taxCodeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  direction: z.enum(['sale', 'purchase', 'either']),
  rateFact: z.string().nullable(),
  treatment: z.string().min(1),
  reportsIn: z.string().min(1),
  useFor: z.string().min(1),
});
export const taxCodesSchema = z.object({
  note: z.string(),
  verifiedOn: isoDate.nullable(),
  AU: z.array(taxCodeSchema).min(4),
  UK: z.array(taxCodeSchema).min(4),
});
export type TaxCode = z.infer<typeof taxCodeSchema>;

const cell = z.object({ summary: z.string().min(1), ref: z.string().min(1) });
export const standardsMappingSchema = z.object({
  frameworks: z.array(z.object({ id: z.enum(['ifrs', 'frs102', 'frs105', 'aasb']), name: z.string(), issuer: z.string(), appliesTo: z.string() })).length(4),
  topics: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        topic: z.string(),
        group: z.string(),
        ifrs: cell,
        frs102: cell,
        frs105: cell,
        aasb: cell,
        changed2026: z.boolean(),
        takeaway: z.string(),
      }),
    )
    .min(6),
});
export type StandardsMapping = z.infer<typeof standardsMappingSchema>;

export const quizSchema = z
  .array(
    z.object({
      id: z.string().regex(/^q-[a-z0-9-]+$/),
      doc: docId,
      jurisdiction,
      question: z.string().min(10),
      options: z.array(z.object({ text: z.string().min(1), why: z.string().min(5) })).min(3).max(5),
      answer: z.number().int().min(0),
      facts: z.array(z.string()).default([]),
    }),
  )
  .refine((qs) => qs.every((q) => q.answer < q.options.length), { message: 'every answer index points at an option' });
export type QuizQuestion = z.infer<typeof quizSchema>[number];

export const flashcardsSchema = z.array(
  z.object({
    id: z.string().regex(/^f-[a-z0-9-]+$/),
    doc: docId,
    jurisdiction,
    front: z.string().min(2),
    back: z.string().min(3),
  }),
);
export type Flashcard = z.infer<typeof flashcardsSchema>[number];

const journalLine = z.object({
  account: z.string().min(1),
  debit: z.number().int().min(0),
  credit: z.number().int().min(0),
});
export const journalScenariosSchema = z.array(
  z.object({
    id: z.string().regex(/^j-[a-z0-9-]+$/),
    title: z.string(),
    jurisdiction,
    doc: docId,
    prompt: z.string().min(10),
    hint: z.string().min(5),
    lines: z.array(journalLine).min(2),
    explanation: z.string().min(10),
    facts: z.array(z.string()).default([]),
  }),
);
export type JournalScenario = z.infer<typeof journalScenariosSchema>[number];

export const codingScenariosSchema = z.array(
  z.object({
    id: z.string().regex(/^c-[a-z0-9-]+$/),
    jurisdiction: z.enum(['AU', 'UK']),
    doc: docId,
    source: z.enum(['bill', 'bank', 'invoice']),
    from: z.string(),
    date: isoDate,
    description: z.string().min(5),
    amountCents: z.number().int(),
    answer: z.object({ account: z.string(), taxCode: z.string() }),
    alsoAccepted: z.array(z.object({ account: z.string(), taxCode: z.string() })).default([]),
    explanation: z.string().min(10),
  }),
);
export type CodingScenario = z.infer<typeof codingScenariosSchema>[number];

export const checklistsSchema = z.array(
  z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string(),
    doc: docId,
    groups: z.array(z.object({ title: z.string(), items: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), text: z.string(), why: z.string() })).min(1) })).min(1),
  }),
);
export type Checklist = z.infer<typeof checklistsSchema>[number];

const entityTypeEnum = z.enum(['sole_trader', 'partnership', 'company', 'trust', 'llp']);

export const intakeItemSchema = z
  .object({
    id: z.string().regex(/^(au|uk)\.[a-zA-Z0-9.]+$/),
    label: z.string().min(5).max(120),
    why: z.string().min(10).max(400),
    docId: docId.nullable(),
    source: z.url().nullable(),
    verifiedOn: isoDate.nullable(),
    forKind: z.enum(OBLIGATION_KINDS).nullable(),
    leadDays: z.number().int().min(0).max(120).nullable(),
  })
  .refine((i) => i.docId !== null || i.source !== null, { message: 'an item needs a docId or a source' })
  .refine((i) => (i.forKind === null) === (i.leadDays === null), { message: 'forKind and leadDays go together' })
  .refine((i) => i.verifiedOn === null || i.source !== null, { message: 'verifiedOn needs a source' });
export type IntakeItem = z.infer<typeof intakeItemSchema>;

export const intakeRuleSchema = z.object({
  id: z.string().regex(/^(au|uk)\.[a-zA-Z0-9.]+$/),
  jurisdiction: z.enum(['AU', 'UK']),
  entityTypes: z.array(entityTypeEnum).min(1),
  taxRegistered: z.boolean().nullable(), // null: either
  taxPeriods: z.array(z.enum(['monthly', 'quarterly', 'annual'])).min(1).nullable(), // null: any, including none
  items: z.array(intakeItemSchema).min(1),
});
export type IntakeRule = z.infer<typeof intakeRuleSchema>;

export const intakeRulesSchema = z.object({ note: z.string().min(10), rules: z.array(intakeRuleSchema).min(1) });
export type IntakeRules = z.infer<typeof intakeRulesSchema>;

export const engagementTemplateStepSchema = z.object({
  title: z.string().trim().min(1).max(300),
  estimateMinutes: z.number().int().min(0).max(10000).nullable(),
});
export type EngagementTemplateStep = z.infer<typeof engagementTemplateStepSchema>;
export const engagementTemplateStepsSchema = z.array(engagementTemplateStepSchema).min(1).max(100);

export const seedEngagementTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  kind: z.enum(ENGAGEMENT_KINDS),
  jurisdiction: z.enum(['AU', 'UK']).nullable(), // null: either
  steps: engagementTemplateStepsSchema,
});
export type SeedEngagementTemplate = z.infer<typeof seedEngagementTemplateSchema>;

export const engagementTemplatesSchema = z
  .object({ note: z.string().min(10), templates: z.array(seedEngagementTemplateSchema).min(1) })
  .refine((t) => new Set(t.templates.map((x) => x.id)).size === t.templates.length, { message: 'template ids must be unique' });
export type EngagementTemplates = z.infer<typeof engagementTemplatesSchema>;
