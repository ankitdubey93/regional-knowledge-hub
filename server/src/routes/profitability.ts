import { Router } from 'express';
import { requireFirm } from '../middleware/session';
import { profitabilityReport } from '../services/profitabilityService';
import { profitQuerySchema } from '../types/profitability';
import { firmOf } from '../types';

// Mounted at /api/profitability. Owners and admins only; orgId and role come only from requireFirm (Hard rule 11).
export const profitabilityRoutes = Router();
profitabilityRoutes.use(requireFirm);

profitabilityRoutes.get('/', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (role === 'member') {
    res.status(403).json({ error: 'Only firm owners and admins can see profitability' });
    return;
  }
  const parsed = profitQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid filter' });
    return;
  }
  const outcome = await profitabilityReport(orgId, parsed.data);
  if ('tooMany' in outcome) {
    res.status(409).json({ error: 'Too many invoices in this period (at most 5000). Choose a shorter period.' });
    return;
  }
  res.status(200).json({ report: outcome.report });
});
