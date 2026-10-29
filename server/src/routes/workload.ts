import express, { Router } from 'express';
import { requireFirm } from '../middleware/session';
import { getWorkload, setCapacity, setFirmTimezone } from '../services/workloadService';
import { capacitySchema, firmTimezoneSchema, memberIdSchema, workloadQuerySchema } from '../types/workload';
import { firmOf } from '../types';

// Mounted at /api/workload. The role comes only from requireFirm, never from a body, query or param (Hard rule 11).

export const workloadRoutes = Router();
workloadRoutes.use(express.json({ limit: '10kb' }), requireFirm);

workloadRoutes.get('/', async (req, res) => {
  const { orgId, role } = firmOf(res);
  // weekStartOf throws RangeError on an impossible date such as 2026-02-31; that is a bad week, not a 500.
  let parsed: ReturnType<typeof workloadQuerySchema.safeParse> | null = null;
  try {
    parsed = workloadQuerySchema.safeParse(req.query);
  } catch {
    parsed = null;
  }
  if (!parsed || !parsed.success) {
    res.status(400).json({ error: 'Invalid week' });
    return;
  }
  const view = await getWorkload(orgId, parsed.data.week ?? null, new Date());
  res.status(200).json({
    timezone: view.timezone,
    canEdit: role !== 'member',
    weekStart: view.weekStart,
    nextWeekStart: view.nextWeekStart,
    rows: view.rows,
  });
});

workloadRoutes.patch('/timezone', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (role === 'member') {
    res.status(403).json({ error: 'Only firm owners and admins can change the firm timezone' });
    return;
  }
  const parsed = firmTimezoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const timezone = await setFirmTimezone(orgId, parsed.data.timezone);
  res.status(200).json({ timezone });
});

workloadRoutes.patch('/capacity/:userId', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (role === 'member') {
    res.status(403).json({ error: 'Only firm owners and admins can set capacity' });
    return;
  }
  const userId = memberIdSchema.safeParse(req.params.userId);
  if (!userId.success) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  const parsed = capacitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const row = await setCapacity(orgId, userId.data, parsed.data.weeklyMinutes);
  if (!row) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  res.status(200).json({ userId: row.userId, weeklyMinutes: row.weeklyMinutes });
});
