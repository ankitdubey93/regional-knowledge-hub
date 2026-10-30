// Retention (P5c). One tick: take a session-level advisory lock on one pooled connection (so one API instance purges at a time),
// purge each firm's expired documents and conversations inside its own withOrg, log one retention.purge event per firm that lost rows,
// then drop rate_bucket rows older than a day. VACUUM is not run here: it needs the owner role (scripts/vacuum.ts).
import { and, eq, isNotNull, lt, or } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { conversation, document, organization, rateBucket } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { recordEvent } from '../services/auditEventService';

export const RETENTION_LOCK_KEY = 5001301;
export const RETENTION_FIRST_DELAY_MS = 60_000;
export const RETENTION_INTERVAL_MS = 21_600_000;
export const RATE_BUCKET_MAX_AGE_MS = 86_400_000;

export interface RetentionTickResult { skipped: boolean; orgs: number; documents: number; conversations: number; rateBuckets: number }

const DAY_MS = 86_400_000;

export async function runRetentionTick(now: Date): Promise<RetentionTickResult> {
  const lockClient = await pool.connect();
  try {
    const lock = await lockClient.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [RETENTION_LOCK_KEY]);
    if (!lock.rows[0]?.ok) return { skipped: true, orgs: 0, documents: 0, conversations: 0, rateBuckets: 0 };
    try {
      const orgs = await db
        .select({
          id: organization.id,
          documentsDays: organization.retentionDaysDocuments,
          conversationsDays: organization.retentionDaysConversations,
        })
        .from(organization)
        .where(or(isNotNull(organization.retentionDaysDocuments), isNotNull(organization.retentionDaysConversations)));

      const cutoff = (days: number) => new Date(now.getTime() - days * DAY_MS);
      let documents = 0;
      let conversations = 0;
      for (const org of orgs) {
        const counts = await withOrg(org.id, async (tx) => {
          let d = 0;
          let c = 0;
          if (org.documentsDays !== null) {
            const gone = await tx
              .delete(document)
              .where(and(eq(document.orgId, org.id), lt(document.createdAt, cutoff(org.documentsDays))))
              .returning({ id: document.id });
            d = gone.length;
          }
          if (org.conversationsDays !== null) {
            const gone = await tx
              .delete(conversation)
              .where(and(eq(conversation.orgId, org.id), lt(conversation.updatedAt, cutoff(org.conversationsDays))))
              .returning({ id: conversation.id });
            c = gone.length;
          }
          if (d > 0 || c > 0) {
            await recordEvent(tx, {
              orgId: org.id,
              actorId: null,
              ipKey: null,
              action: 'retention.purge',
              targetType: 'organization',
              targetId: org.id,
              detail: { documents: d, conversations: c },
            });
          }
          return { d, c };
        });
        documents += counts.d;
        conversations += counts.c;
      }

      const buckets = await db
        .delete(rateBucket)
        .where(lt(rateBucket.windowStart, new Date(now.getTime() - RATE_BUCKET_MAX_AGE_MS)))
        .returning({ key: rateBucket.key });

      return { skipped: false, orgs: orgs.length, documents, conversations, rateBuckets: buckets.length };
    } finally {
      await lockClient.query('select pg_advisory_unlock($1)', [RETENTION_LOCK_KEY]);
    }
  } finally {
    lockClient.release();
  }
}

export function startRetentionJob(): () => void {
  const tick = () => {
    runRetentionTick(new Date()).then(
      (r) => console.info('retention', r),
      () => console.error('retention', { ok: false }),
    );
  };
  const first = setTimeout(tick, RETENTION_FIRST_DELAY_MS);
  const every = setInterval(tick, RETENTION_INTERVAL_MS);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
