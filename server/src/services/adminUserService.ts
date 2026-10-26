import { count, desc, eq, ilike, inArray, max } from 'drizzle-orm';
import { auth } from '../auth';
import { db } from '../db/client';
import { member, organization, session, user } from '../db/schema';
import { PLATFORM_ADMIN_ROLE, USERS_PAGE_SIZE, type AdminUserRow } from '../types/admin';
import { recordAudit } from './auditService';

// These are Better Auth's tables, not tenant tables, so no withOrg. Audit rows carry ids only (Hard rule 13).

function emailFilter(q: string) {
  if (q === '') return undefined;
  const escaped = q.replace(/[\\%_]/g, '\\$&');
  return ilike(user.email, `%${escaped}%`);
}

export async function countUsers(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(user);
  return row?.n ?? 0;
}

export async function listUsers(q: string, page: number): Promise<{ users: AdminUserRow[]; total: number }> {
  const where = emailFilter(q);
  const rows = await db
    .select()
    .from(user)
    .where(where)
    .orderBy(desc(user.createdAt))
    .limit(USERS_PAGE_SIZE)
    .offset((page - 1) * USERS_PAGE_SIZE);
  const [totalRow] = await db.select({ n: count() }).from(user).where(where);
  const total = totalRow?.n ?? 0;
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { users: [], total };

  const memberships = await db
    .select({
      userId: member.userId,
      id: organization.id,
      name: organization.name,
      kind: organization.kind,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(inArray(member.userId, ids));
  const activity = await db
    .select({ userId: session.userId, last: max(session.updatedAt) })
    .from(session)
    .where(inArray(session.userId, ids))
    .groupBy(session.userId);

  const lastByUser = new Map(activity.map((a) => [a.userId, a.last]));
  const users: AdminUserRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    createdAt: r.createdAt,
    banned: r.banned === true,
    isPlatformAdmin: r.role === PLATFORM_ADMIN_ROLE,
    lastActiveAt: lastByUser.get(r.id) ?? null,
    workspaces: memberships
      .filter((m) => m.userId === r.id)
      .map((m) => ({ id: m.id, name: m.name, kind: m.kind, role: m.role })),
  }));
  return { users, total };
}

async function userExists(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  return row !== undefined;
}

export type BanOutcome = 'done' | 'not_found' | 'self';

export async function banUser(actorId: string, headers: Headers, userId: string, reason: string): Promise<BanOutcome> {
  if (actorId === userId) return 'self';
  if (!(await userExists(userId))) return 'not_found';
  await auth.api.banUser({ body: { userId, banReason: reason }, headers });
  await recordAudit(db, { actorId, action: 'user.ban', targetType: 'user', targetId: userId });
  return 'done';
}

export async function unbanUser(actorId: string, headers: Headers, userId: string): Promise<'done' | 'not_found'> {
  if (!(await userExists(userId))) return 'not_found';
  await auth.api.unbanUser({ body: { userId }, headers });
  await recordAudit(db, { actorId, action: 'user.unban', targetType: 'user', targetId: userId });
  return 'done';
}
