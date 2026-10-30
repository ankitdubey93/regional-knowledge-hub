// Audit events for actions Better Auth performs (P5c). Runs after Better Auth commits; a failure is logged, never thrown.
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { member } from '../db/schema';
import { recordEventForOrg, type AuditEventInput } from './auditEventService';
import { ipKey } from './rateLimitService';

const invitationBody = z.object({ id: z.string(), organizationId: z.string(), role: z.string() });
const memberBody = z.object({ id: z.string(), organizationId: z.string(), userId: z.string(), role: z.string() });
const removedBody = z.object({ member: memberBody });

export const auditAfterHook = createAuthMiddleware(async (ctx) => {
  const returned = ctx.context.returned;
  if (returned === undefined || isAPIError(returned)) return;
  const forwarded = ctx.headers?.get('x-forwarded-for');
  const ip = forwarded ? ipKey(forwarded) : null;
  const actorId = (await getSessionFromCtx(ctx))?.user.id ?? null;
  const events: AuditEventInput[] = [];

  if (ctx.path === '/sign-in/email') {
    const userId = ctx.context.newSession?.user.id;
    if (!userId) return;
    const rows = await db.select({ orgId: member.organizationId }).from(member).where(eq(member.userId, userId));
    for (const { orgId } of rows) {
      events.push({ orgId, actorId: userId, action: 'sign_in', targetType: 'user', targetId: userId, ipKey: ip, detail: {} });
    }
  } else if (ctx.path === '/organization/invite-member') {
    const p = invitationBody.safeParse(returned);
    if (p.success) {
      const d = p.data;
      events.push({ orgId: d.organizationId, actorId, action: 'member.invite', targetType: 'invitation', targetId: d.id, ipKey: ip, detail: { role: d.role } });
    }
  } else if (ctx.path === '/organization/remove-member') {
    const p = removedBody.safeParse(returned);
    if (p.success) {
      const m = p.data.member;
      events.push({ orgId: m.organizationId, actorId, action: 'member.remove', targetType: 'member', targetId: m.id, ipKey: ip, detail: { userId: m.userId, role: m.role } });
    }
  } else if (ctx.path === '/organization/update-member-role') {
    const p = memberBody.safeParse(returned);
    if (p.success) {
      const d = p.data;
      events.push({ orgId: d.organizationId, actorId, action: 'member.role', targetType: 'member', targetId: d.id, ipKey: ip, detail: { userId: d.userId, role: d.role } });
    }
  }

  for (const e of events) {
    try {
      await recordEventForOrg(e);
    } catch {
      console.error('audit', { action: e.action, ok: false });
    }
  }
});
