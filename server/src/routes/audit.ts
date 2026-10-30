import { Router } from 'express';
import { requireFirm } from '../middleware/session';
import { listEvents } from '../services/auditEventService';
import { firmOf } from '../types';
import { auditQuerySchema } from '../types/audit';

// Mounted at /api/audit. Owners and admins read their own firm's log; the role comes only from requireFirm (Hard rule 11).
export const auditRoutes = Router();
auditRoutes.use(requireFirm);

auditRoutes.get('/', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (role === 'member') {
    res.status(403).json({ error: 'Only firm owners and admins can see the audit log' });
    return;
  }
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query' });
    return;
  }
  const { events, nextBefore } = await listEvents(orgId, parsed.data.before ?? null, parsed.data.limit);
  res.status(200).json({ events, nextBefore });
});
