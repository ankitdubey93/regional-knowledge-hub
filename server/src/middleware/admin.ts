import type { RequestHandler } from 'express';
import { eq } from 'drizzle-orm';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth';
import { db } from '../db/client';
import { user } from '../db/schema';
import { PLATFORM_ADMIN_ROLE } from '../types/admin';

// Anyone who is not the platform admin gets 404, so the panel is not advertised.
// The role is always read from the database, never from the session object or the request.
export const requireAdmin: RequestHandler = async (req, res, next) => {
  const s = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!s) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const [row] = await db
    .select({ role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, s.user.id))
    .limit(1);
  if (!row || row.role !== PLATFORM_ADMIN_ROLE || row.banned === true) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.locals.admin = { userId: s.user.id, email: s.user.email };
  next();
};
