import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organization } from './auth-schema';

export * from './auth-schema';

// Tenant table: RLS is enabled and forced in migration 0003 (Hard rule 11).
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
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('client_org_idx').on(t.orgId)],
);
