import type { RequestHandler } from 'express';
import { and, eq } from 'drizzle-orm';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth';
import { db } from '../db/client';
import { member } from '../db/schema';
import { firmRoleSchema } from '../types';

// orgId comes only from the session's active organization, never from a body, query or param.
export const requireFirm: RequestHandler = async (req, res, next) => {
  const s = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!s) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  const orgId = s.session.activeOrganizationId;
  if (!orgId) {
    res.status(403).json({ error: 'No active firm' });
    return;
  }
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, s.user.id)))
    .limit(1);
  const parsed = firmRoleSchema.safeParse(row?.role);
  if (!parsed.success) {
    res.status(403).json({ error: 'No active firm' });
    return;
  }
  res.locals.firm = { userId: s.user.id, orgId, role: parsed.data };
  next();
};
