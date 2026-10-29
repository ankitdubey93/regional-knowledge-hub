import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { ACCOUNT_CLASSES } from '@chub/shared/utils/accountClasses';
import { REQUEST_SOURCES, REQUEST_STATUSES } from '@chub/shared/utils/intake';
import type { CurriculumMeta, EngagementTemplateStep, Fact } from '@chub/shared/data/schemas';
import { ENGAGEMENT_KINDS, ENGAGEMENT_STATUSES, TASK_STATUSES } from '@chub/shared/utils/engagements';
import type { ImportIssue } from '@chub/shared/utils/ledgerImport';
import { CHAT_SCOPES, MESSAGE_ROLES, MESSAGE_STATUSES, type GroundingFlag } from '@chub/shared/lib/chatWire';
import { organization, user } from './auth-schema';

export * from './auth-schema';

// Tenant table: RLS is enabled and forced in migration 0003 (Hard rule 11); profile checks are in 0005.
// Postgres bytea as a Node Buffer. Holds only sealed data (privacy/crypto.ts).
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

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
    timezone: text('timezone'),
    registeredOn: date('registered_on', { mode: 'string' }),
    vatStaggerMonth: smallint('vat_stagger_month'),
    mtdItsa: boolean('mtd_itsa').notNull().default(false),
    autoEngagements: boolean('auto_engagements').notNull().default(false),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('client_org_idx').on(t.orgId), unique('client_id_org_unique').on(t.id, t.orgId)],
);

// Tenant table: RLS is enabled and forced in migration 0012 (Hard rule 11).
export const ledgerImport = pgTable(
  'ledger_import',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    source: text('source', { enum: ['xero', 'qbo', 'myob', 'other'] }).notNull(),
    currency: text('currency', { enum: ['AUD', 'GBP'] }).notNull(),
    asAt: date('as_at', { mode: 'string' }).notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    originalName: text('original_name').notNull(),
    sha256: text('sha256').notNull(),
    rowCount: integer('row_count').notNull(),
    totalDebitCents: bigint('total_debit_cents', { mode: 'number' }).notNull(),
    status: text('status', { enum: ['active', 'superseded'] }).notNull().default('active'),
    warnings: jsonb('warnings').$type<ImportIssue[]>().notNull().default(sql`'[]'::jsonb`),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.orgId], foreignColumns: [client.id, client.orgId], name: 'ledger_import_client_org_fk' }).onDelete('cascade'),
    unique('ledger_import_id_org_unique').on(t.id, t.orgId),
    index('ledger_import_org_idx').on(t.orgId),
    index('ledger_import_client_idx').on(t.clientId),
    uniqueIndex('ledger_import_one_active_per_date').on(t.clientId, t.asAt).where(sql`status = 'active'`),
  ],
);

// Tenant table: RLS is enabled and forced in migration 0012 (Hard rule 11).
export const ledgerAccount = pgTable(
  'ledger_account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    sourceType: text('source_type').notNull().default(''),
    accountClass: text('account_class', { enum: ACCOUNT_CLASSES }).notNull(),
    classSetBy: text('class_set_by', { enum: ['import', 'user'] }).notNull().default('import'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.orgId], foreignColumns: [client.id, client.orgId], name: 'ledger_account_client_org_fk' }).onDelete('cascade'),
    unique('ledger_account_id_org_unique').on(t.id, t.orgId),
    uniqueIndex('ledger_account_client_code_idx').on(t.clientId, t.code),
  ],
);

// Tenant table: RLS is enabled and forced in migration 0012 (Hard rule 11).
export const ledgerBalance = pgTable(
  'ledger_balance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    importId: uuid('import_id').notNull(),
    accountId: uuid('account_id').notNull(),
    debitCents: bigint('debit_cents', { mode: 'number' }).notNull(),
    creditCents: bigint('credit_cents', { mode: 'number' }).notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.importId, t.orgId], foreignColumns: [ledgerImport.id, ledgerImport.orgId], name: 'ledger_balance_import_org_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.accountId, t.orgId], foreignColumns: [ledgerAccount.id, ledgerAccount.orgId], name: 'ledger_balance_account_org_fk' }).onDelete('restrict'),
    uniqueIndex('ledger_balance_import_account_idx').on(t.importId, t.accountId),
  ],
);

// Tenant table: RLS is enabled and forced in migration 0016 (Hard rule 11).
export const conversation = pgTable(
  'conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id'),
    userId: text('user_id').notNull(),
    title: text('title').notNull().default('New chat'),
    scope: text('scope', { enum: CHAT_SCOPES }),
    redactionMap: bytea('redaction_map'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.orgId], foreignColumns: [client.id, client.orgId], name: 'conversation_client_org_fk' }).onDelete('cascade'),
    unique('conversation_id_org_unique').on(t.id, t.orgId),
    unique('conversation_id_client_org_unique').on(t.id, t.clientId, t.orgId),
    index('conversation_org_client_idx').on(t.orgId, t.clientId, t.updatedAt),
  ],
);

// Tenant table: RLS is enabled and forced in migration 0016 (Hard rule 11).
export const chatMessage = pgTable(
  'chat_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull(),
    role: text('role', { enum: MESSAGE_ROLES }).notNull(),
    body: text('body').notNull(),
    status: text('status', { enum: MESSAGE_STATUSES }).notNull(),
    flags: jsonb('flags').$type<GroundingFlag[]>().notNull().default([]),
    provider: text('provider'),
    model: text('model'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.conversationId, t.orgId], foreignColumns: [conversation.id, conversation.orgId], name: 'chat_message_conversation_org_fk' }).onDelete('cascade'),
    unique('chat_message_id_org_unique').on(t.id, t.orgId),
    index('chat_message_conversation_idx').on(t.conversationId, t.createdAt),
  ],
);

// Tenant table: RLS is enabled and forced in migration 0016 (Hard rule 11).
export const chatCitation = pgTable(
  'chat_citation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').notNull(),
    marker: integer('marker').notNull(),
    sourceId: uuid('source_id'),
    versionId: uuid('version_id'),
    chunkId: uuid('chunk_id'),
    title: text('title').notNull(),
    citation: text('citation').notNull(),
    kind: text('kind').notNull(),
    jurisdiction: text('jurisdiction').notNull(),
    billStatus: text('bill_status'),
    headingPath: text('heading_path').array().notNull().default(sql`'{}'::text[]`),
    provisionRef: text('provision_ref'),
    sitePath: text('site_path'),
    officialUrl: text('official_url'),
    excerpt: text('excerpt').notNull(),
    // P3b: a ledger citation. No FK to ledger_import: a citation is a snapshot (its excerpt is stored) that outlives a deleted import.
    ledgerImportId: uuid('ledger_import_id'),
    ledgerCompareImportId: uuid('ledger_compare_import_id'),
    ledgerReport: text('ledger_report', { enum: ['pnl', 'bs'] }),
    ledgerAsAt: date('ledger_as_at', { mode: 'string' }),
  },
  (t) => [
    foreignKey({ columns: [t.messageId, t.orgId], foreignColumns: [chatMessage.id, chatMessage.orgId], name: 'chat_citation_message_org_fk' }).onDelete('cascade'),
    uniqueIndex('chat_citation_message_marker_idx').on(t.messageId, t.marker),
  ],
);

// Global, not a tenant table: provider calls for the spend guard. No text. Append-only for chub_app (migration 0016).
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id').notNull(),
    userId: text('user_id').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    costMicroUsd: bigint('cost_micro_usd', { mode: 'number' }).notNull(),
    estimated: boolean('estimated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ai_usage_created_idx').on(t.createdAt),
    index('ai_usage_user_created_idx').on(t.userId, t.createdAt),
  ],
);

// Global, not a tenant table: keys are per IP (HMAC) or per user, across firms. No text, no raw IP.
export const rateBucket = pgTable('rate_bucket', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull(),
});

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
  meta: jsonb('meta').$type<CurriculumMeta>(),
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

export const FACT_UNITS = ['bp', 'cents', 'count', 'date', 'text'] as const;
// Global (Hard rule 16): written only by requireAdmin routes and the seed. Checks live in 0014.
export const kbFact = pgTable('kb_fact', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  jurisdiction: text('jurisdiction', { enum: KB_JURISDICTIONS }).notNull(),
  unit: text('unit', { enum: FACT_UNITS }).notNull(),
  valueNum: bigint('value_num', { mode: 'number' }),
  valueText: text('value_text'),
  effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
  source: text('source').notNull(),
  verifiedOn: date('verified_on', { mode: 'string' }),
  note: text('note'),
  updatedBy: text('updated_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const kbFactHistory = pgTable('kb_fact_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  factKey: text('fact_key').notNull().references(() => kbFact.key, { onDelete: 'restrict' }),
  fact: jsonb('fact').$type<Fact>().notNull(),
  changeNote: text('change_note').notNull(),
  changedBy: text('changed_by').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('kb_fact_history_key_idx').on(t.factKey, t.changedAt)]);

export const DOCUMENT_KINDS = ['pdf', 'docx', 'xlsx', 'csv', 'text', 'markdown'] as const;

// Tenant table: RLS is enabled and forced in migration 0021 (Hard rule 11).
export const document = pgTable(
  'document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    uploadedBy: text('uploaded_by').notNull(),
    originalName: text('original_name').notNull(),
    kind: text('kind', { enum: DOCUMENT_KINDS }).notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: text('sha256').notNull(),
    textChars: integer('text_chars').notNull(),
    truncated: boolean('truncated').notNull().default(false),
    fileEnc: bytea('file_enc').notNull(),
    textEnc: bytea('text_enc').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.orgId], foreignColumns: [client.id, client.orgId], name: 'document_client_org_fk' }).onDelete('cascade'),
    unique('document_id_org_unique').on(t.id, t.orgId),
    unique('document_id_client_org_unique').on(t.id, t.clientId, t.orgId),
    uniqueIndex('document_client_sha_idx').on(t.clientId, t.sha256),
  ],
);

// Tenant table: RLS is enabled and forced in migration 0021 (Hard rule 11).
export const conversationDocument = pgTable(
  'conversation_document',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull(),
    clientId: uuid('client_id').notNull(),
    documentId: uuid('document_id').notNull(),
    attachedBy: text('attached_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.documentId], name: 'conversation_document_pk' }),
    foreignKey({
      columns: [t.conversationId, t.clientId, t.orgId],
      foreignColumns: [conversation.id, conversation.clientId, conversation.orgId],
      name: 'conversation_document_conversation_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.documentId, t.clientId, t.orgId],
      foreignColumns: [document.id, document.clientId, document.orgId],
      name: 'conversation_document_document_fk',
    }).onDelete('cascade'),
  ],
);

// Tenant table: RLS is enabled and forced in migration 0025 (Hard rule 11).
export const documentRequest = pgTable(
  'document_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    itemId: text('item_id').notNull(),
    label: text('label').notNull(),
    why: text('why').notNull().default(''),
    docId: text('doc_id'),
    sourceUrl: text('source_url'),
    verifiedOn: date('verified_on', { mode: 'string' }),
    dueOn: date('due_on', { mode: 'string' }),
    status: text('status', { enum: REQUEST_STATUSES }).notNull().default('open'),
    source: text('source', { enum: REQUEST_SOURCES }).notNull(),
    obligationId: text('obligation_id'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.orgId], foreignColumns: [client.id, client.orgId], name: 'document_request_client_org_fk' }).onDelete('cascade'),
    unique('document_request_item_unique').on(t.clientId, t.itemId, t.obligationId).nullsNotDistinct(),
    index('document_request_client_idx').on(t.clientId),
  ],
);

// Tenant tables (W1): RLS is enabled and forced in migration 0027 (Hard rule 11).
export const engagementTemplate = pgTable(
  'engagement_template',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ENGAGEMENT_KINDS }).notNull(),
    seedId: text('seed_id'),
    steps: jsonb('steps').$type<EngagementTemplateStep[]>().notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('engagement_template_org_idx').on(t.orgId)],
);

export const engagement = pgTable(
  'engagement',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    templateId: text('template_id'),
    title: text('title').notNull(),
    kind: text('kind', { enum: ENGAGEMENT_KINDS }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    status: text('status', { enum: ENGAGEMENT_STATUSES }).notNull().default('planned'),
    obligationId: text('obligation_id'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.orgId], foreignColumns: [client.id, client.orgId], name: 'engagement_client_org_fk' }).onDelete('cascade'),
    unique('engagement_id_org_unique').on(t.id, t.orgId),
    unique('engagement_obligation_unique').on(t.clientId, t.obligationId),
    index('engagement_client_idx').on(t.clientId),
    index('engagement_org_due_idx').on(t.orgId, t.dueOn),
  ],
);

export const task = pgTable(
  'task',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    engagementId: uuid('engagement_id').notNull(),
    title: text('title').notNull(),
    position: integer('position').notNull(),
    assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
    dueOn: date('due_on', { mode: 'string' }),
    estimateMinutes: integer('estimate_minutes'),
    status: text('status', { enum: TASK_STATUSES }).notNull().default('todo'),
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.engagementId, t.orgId], foreignColumns: [engagement.id, engagement.orgId], name: 'task_engagement_org_fk' }).onDelete('cascade'),
    index('task_engagement_idx').on(t.engagementId),
    index('task_assignee_idx').on(t.assigneeId),
  ],
);

// Tenant table (W2): RLS is enabled and forced in migration 0031 (Hard rule 11).
export const memberCapacity = pgTable(
  'member_capacity',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    weeklyMinutes: integer('weekly_minutes').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId], name: 'member_capacity_pk' })],
);
