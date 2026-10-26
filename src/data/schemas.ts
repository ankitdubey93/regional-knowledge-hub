import { z } from 'zod';

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
export const factsSchema = z.record(z.string().regex(/^(au|uk|intl)\.[a-zA-Z0-9.]+$/), factSchema);
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
