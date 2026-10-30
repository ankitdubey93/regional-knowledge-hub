// Reminders for client request links (C3). One tick: take a session-level advisory lock on one pooled connection (so one API instance
// sends at a time), find live links whose cadence has passed, send mail OUTSIDE any transaction, then record the count only if it is
// unchanged. Never logs a token, URL or address (Hard rule 13); the result holds counts only.
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { formatDay } from '@chub/shared/utils/deadlines';
import { db, pool } from '../db/client';
import { organization, requestLink } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { env } from '../env';
import { sendMail } from '../mail/mailer';
import { requestNudgeMail } from '../mail/templates';
import { aadFor, unseal } from '../privacy/crypto';
import { recordEvent } from '../services/auditEventService';

export const NUDGE_LOCK_KEY = 5001302;
export const NUDGE_FIRST_DELAY_MS = 90_000;
export const NUDGE_INTERVAL_MS = 600_000;

export interface NudgeTickResult { skipped: boolean; sent: number; failed: number }

const DAY_MS = 86_400_000;

/** How many cadence days have passed: count of d with createdAt + d days <= now. */
export function nudgesDue(cadenceDays: readonly number[], createdAt: Date, now: Date): number {
  return cadenceDays.filter((d) => createdAt.getTime() + d * DAY_MS <= now.getTime()).length;
}

export async function runNudgeTick(now: Date): Promise<NudgeTickResult> {
  const lockClient = await pool.connect();
  try {
    const lock = await lockClient.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [NUDGE_LOCK_KEY]);
    if (!lock.rows[0]?.ok) return { skipped: true, sent: 0, failed: 0 };
    try {
      const orgs = await db.select({ id: organization.id, name: organization.name }).from(organization);
      let sent = 0;
      let failed = 0;
      for (const org of orgs) {
        const due = await withOrg(org.id, async (tx) => {
          const rows = await tx
            .select({
              link: requestLink,
              // Literal names: drizzle renders a column in a single-table select without its table, which is ambiguous in a subquery.
              openItems: sql<number>`(
                select count(*)::int from request_link_item li
                join document_request dr on dr.id = li.request_id and dr.client_id = li.client_id and dr.org_id = li.org_id
                where li.link_id = request_link.id and li.org_id = ${org.id} and dr.status = 'open'
              )`,
            })
            .from(requestLink)
            .where(
              and(
                eq(requestLink.orgId, org.id),
                isNull(requestLink.revokedAt),
                eq(requestLink.paused, false),
                gt(requestLink.expiresAt, now),
                sql`${requestLink.nudgeCount} < cardinality(${requestLink.cadenceDays})`,
              ),
            );
          return rows
            .filter((r) => r.openItems > 0)
            .map((r) => ({ link: r.link, due: nudgesDue(r.link.cadenceDays, r.link.createdAt, now) }))
            .filter((r) => r.due > r.link.nudgeCount);
        });

        for (const { link, due: count } of due) {
          try {
            const token = unseal(link.tokenEnc, aadFor('request_link.token', org.id, link.id)).toString('utf8');
            await sendMail({
              to: link.recipientEmail,
              ...requestNudgeMail(org.name, `${env.WEB_ORIGIN}/r/${token}`, formatDay(link.expiresAt.toISOString().slice(0, 10))),
            });
          } catch {
            failed += 1;
            console.error('nudge', { ok: false });
            continue;
          }
          const changed = await withOrg(org.id, async (tx) => {
            const updated = await tx
              .update(requestLink)
              .set({ nudgeCount: count, lastNudgedAt: now })
              .where(and(eq(requestLink.id, link.id), eq(requestLink.orgId, org.id), eq(requestLink.nudgeCount, link.nudgeCount)))
              .returning({ id: requestLink.id });
            if (updated.length === 0) return false;
            await recordEvent(tx, {
              orgId: org.id,
              actorId: null,
              ipKey: null,
              action: 'request_link.nudge',
              targetType: 'request_link',
              targetId: link.id,
              detail: { clientId: link.clientId, nudge: count },
            });
            return true;
          });
          if (changed) sent += 1;
        }
      }
      return { skipped: false, sent, failed };
    } finally {
      await lockClient.query('select pg_advisory_unlock($1)', [NUDGE_LOCK_KEY]);
    }
  } finally {
    lockClient.release();
  }
}

export function startNudgeJob(): () => void {
  const tick = () => {
    runNudgeTick(new Date()).then(
      (r) => console.info('nudges', r),
      () => console.error('nudges', { ok: false }),
    );
  };
  const first = setTimeout(tick, NUDGE_FIRST_DELAY_MS);
  const every = setInterval(tick, NUDGE_INTERVAL_MS);
  first.unref();
  every.unref();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
