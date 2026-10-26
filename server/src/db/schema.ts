import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { organization } from './auth-schema';

export * from './auth-schema';

// Tenant table: RLS is enabled and forced in migration 0003 (Hard rule 11); profile checks are in 0005.
export const client = pgTable(
  'client',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    jurisdiction: text('jurisdiction', { enum: ['AU', 'UK', 'AU+UK'] }).notNull(),
    notes: text('notes').notNull().default(''),
    entities: text('entities').array().notNull().default(sql`'{}'::text[]`),
    isSelf: boolean('is_self').notNull().default(false),
    entityType: text('entity_type', { enum: ['sole_trader', 'partnership', 'company', 'trust', 'llp'] }),
    taxRegistered: boolean('tax_registered').notNull().default(false),
    taxPeriod: text('tax_period', { enum: ['monthly', 'quarterly', 'annual'] }),
    fyEndMonth: smallint('fy_end_month'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('client_org_idx').on(t.orgId)],
);

// Global, not a tenant table: the platform admin's actions. Append-only for chub_app (migration 0007).
export const adminAudit = pgTable(
  'admin_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    detail: jsonb('detail').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_audit_at_idx').on(t.at)],
);

export const KB_JURISDICTIONS = ['AU', 'UK', 'INTL'] as const;
export const KB_KINDS = ['act', 'regulation', 'bill', 'ruling', 'guidance', 'standard', 'curriculum'] as const;
export const BILL_STATUSES = ['introduced', 'passed', 'assented', 'lapsed'] as const;
export const VERSION_STATUSES = ['draft', 'published', 'superseded', 'withdrawn'] as const;
export const INPUT_METHODS = ['paste', 'file', 'url', 'copy', 'seed'] as const;
export interface KbIssue { level: 'block' | 'warn'; code: string; message: string }

// Global knowledge base: not tenant tables (no org_id, no RLS). Written only through requireAdmin routes and the seed script.
export const kbSource = pgTable('kb_source', {
  id: uuid('id').primaryKey().defaultRandom(),
  jurisdiction: text('jurisdiction', { enum: KB_JURISDICTIONS }).notNull(),
  kind: text('kind', { enum: KB_KINDS }).notNull(),
  title: text('title').notNull(),
  citation: text('citation').notNull(),
  officialUrl: text('official_url'),
  publisher: text('publisher').notNull().default(''),
  billStatus: text('bill_status', { enum: BILL_STATUSES }),
  enactedAsSourceId: uuid('enacted_as_source_id').references((): AnyPgColumn => kbSource.id, { onDelete: 'set null' }),
  sitePath: text('site_path'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('kb_source_site_path_idx').on(t.sitePath)]);

export const kbVersion = pgTable('kb_version', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => kbSource.id, { onDelete: 'restrict' }),
  label: text('label').notNull(),
  status: text('status', { enum: VERSION_STATUSES }).notNull().default('draft'),
  effectiveFrom: date('effective_from', { mode: 'string' }),
  effectiveTo: date('effective_to', { mode: 'string' }),
  retrievedOn: date('retrieved_on', { mode: 'string' }).notNull(),
  inputMethod: text('input_method', { enum: INPUT_METHODS }).notNull(),
  originalName: text('original_name'),
  bodyMd: text('body_md').notNull(),
  sha256: text('sha256').notNull(),
  changeNote: text('change_note').notNull().default(''),
  issues: jsonb('issues').$type<KbIssue[]>().notNull().default([]),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedBy: text('published_by'),
}, (t) => [index('kb_version_source_idx').on(t.sourceId)]);

// tsv (generated tsvector) and the search indexes are added in custom migration 0010, not here.
export const kbChunk = pgTable('kb_chunk', {
  id: uuid('id').primaryKey().defaultRandom(),
  versionId: uuid('version_id').notNull().references(() => kbVersion.id, { onDelete: 'cascade' }),
  ordinal: integer('ordinal').notNull(),
  headingPath: text('heading_path').array().notNull().default(sql`'{}'::text[]`),
  provisionRef: text('provision_ref'),
  context: text('context').notNull(),
  text: text('text').notNull(),
  tokens: integer('tokens').notNull(),
  embedding: vector('embedding', { dimensions: 768 }),
  embedModel: text('embed_model'),
  embeddedAt: timestamp('embedded_at', { withTimezone: true }),
}, (t) => [uniqueIndex('kb_chunk_version_ordinal_idx').on(t.versionId, t.ordinal)]);
