import express, { Router } from 'express';
import { requireFirm } from '../middleware/session';
import { actorFrom } from '../services/auditEventService';
import { getRetention, setRetention } from '../services/retentionService';
import { firmOf } from '../types';
import { retentionInputSchema } from '../types/audit';

// Mounted at /api/workspace. Retention (P5c): any member reads it, only the owner changes it.
export const workspaceRoutes = Router();
workspaceRoutes.use(express.json({ limit: '10kb' }), requireFirm);

workspaceRoutes.get('/retention', async (_req, res) => {
  const { orgId, role } = firmOf(res);
  res.status(200).json({ retention: await getRetention(orgId), canEdit: role === 'owner' });
});

workspaceRoutes.patch('/retention', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (role !== 'owner') {
    res.status(403).json({ error: 'Only the workspace owner can change retention' });
    return;
  }
  const parsed = retentionInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  res.status(200).json({ retention: await setRetention(orgId, actorFrom(userId, req.ip), parsed.data) });
});
