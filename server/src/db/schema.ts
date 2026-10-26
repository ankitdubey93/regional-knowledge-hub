import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
