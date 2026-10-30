import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { env } from '../env';

// rate_bucket is global (no RLS, so no withOrg): keys span firms and anonymous IPs. It holds no text and no raw IP (Hard rule 13).
// The limits are untuned guesses.
export const LIMITS = {
  signIn: { window: 900, max: 10 }, // per IP, Better Auth path /sign-in/email
  signUp: { window: 3600, max: 5 }, // per IP, /sign-up/email
  passwordReset: { window: 3600, max: 3 }, // per IP, /request-password-reset (used from P5b)
  authDefault: { window: 60, max: 100 }, // per IP, every other /api/auth path
  chatMessage: { window: 60, max: 10 }, // per user, POST /api/conversations/:id/messages
  upload: { window: 3600, max: 60 }, // per user, POST /api/clients/:clientId/documents
  ledgerImport: { window: 3600, max: 30 }, // per user, POST /api/clients/:clientId/ledger/imports
  kbIngest: { window: 3600, max: 60 }, // per user, POST /api/admin/kb/sources/:id/versions and .../upload
  publicView: { window: 3600, max: 120 }, // per IP, GET /api/public/requests/:token
  publicUpload: { window: 3600, max: 20 }, // per IP, POST /api/public/requests/:token/items/:requestId/upload
  requestLink: { window: 3600, max: 30 }, // per user, POST /api/clients/:clientId/request-links
} as const;

export type LimitName = keyof typeof LIMITS;

/** HMAC-SHA256(BETTER_AUTH_SECRET, ip), first 32 hex chars. */
export function ipKey(ip: string): string {
  return createHmac('sha256', env.BETTER_AUTH_SECRET).update(ip).digest('hex').slice(0, 32);
}

/** One atomic upsert. allowed = count after increment <= max. retryAfter (whole seconds, >= 1) only when not allowed. */
export async function consume(
  key: string,
  rule: { window: number; max: number },
  now: Date = new Date(),
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const ts = now.toISOString();
  const result = await db.execute<{ count: number; retry_after: number }>(sql`
    INSERT INTO rate_bucket (key, window_start, count) VALUES (${key}, ${ts}::timestamptz, 1)
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE WHEN rate_bucket.window_start <= ${ts}::timestamptz - make_interval(secs => ${rule.window}) THEN ${ts}::timestamptz ELSE rate_bucket.window_start END,
      count        = CASE WHEN rate_bucket.window_start <= ${ts}::timestamptz - make_interval(secs => ${rule.window}) THEN 1 ELSE rate_bucket.count + 1 END
    RETURNING count, ceil(extract(epoch from (window_start + make_interval(secs => ${rule.window}) - ${ts}::timestamptz)))::int AS retry_after
  `);
  const row = result.rows[0];
  if (!row) throw new Error('rate_bucket upsert returned no row');
  if (row.count <= rule.max) return { allowed: true, retryAfter: null };
  return { allowed: false, retryAfter: Math.max(1, row.retry_after) };
}
