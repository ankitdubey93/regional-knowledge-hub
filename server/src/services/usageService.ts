import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { aiUsage } from '../db/schema';
import { env } from '../env';
import { costMicroUsd, usdToMicroUsd, type UsageTokens } from '../ai/pricing';

// ai_usage is global (no RLS) and is inserted only here; chub_app cannot update or delete it. It holds no text (Hard rule 13).

export type GuardOutcome = { ok: true } | { ok: false; reason: 'user_limit'; limit: number } | { ok: false; reason: 'spend_cap' };

export const LIMIT_MESSAGES = (): number => env.CHAT_DAILY_MESSAGES_PER_USER;

/** Global sum of cost_micro_usd since 00:00 UTC today >= the cap → spend_cap; this user's ai_usage rows since 00:00 UTC >= the limit → user_limit. Spend cap is checked first. */
export async function checkGuard(userId: string, now: Date): Promise<GuardOutcome> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const spent = await db
    .select({ total: sql<string>`coalesce(sum(${aiUsage.costMicroUsd}), 0)::text` })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, today));
  const totalMicroUsd = Number(spent[0]?.total ?? '0');
  if (totalMicroUsd >= usdToMicroUsd(env.DAILY_SPEND_CAP_USD)) return { ok: false, reason: 'spend_cap' };

  const used = await db
    .select({ n: count() })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, today)));
  const limit = LIMIT_MESSAGES();
  if ((used[0]?.n ?? 0) >= limit) return { ok: false, reason: 'user_limit', limit };

  return { ok: true };
}

export async function recordUsage(row: {
  orgId: string;
  userId: string;
  provider: string;
  model: string;
  tokens: UsageTokens;
  estimated: boolean;
}): Promise<void> {
  await db.insert(aiUsage).values({
    orgId: row.orgId,
    userId: row.userId,
    provider: row.provider,
    model: row.model,
    inputTokens: row.tokens.inputTokens,
    outputTokens: row.tokens.outputTokens,
    cacheWriteTokens: row.tokens.cacheWriteTokens,
    cacheReadTokens: row.tokens.cacheReadTokens,
    costMicroUsd: costMicroUsd(row.model, row.tokens),
    estimated: row.estimated,
  });
}
