import express, { Router } from 'express';
import { z } from 'zod';
import { requireFirm } from '../middleware/session';
import { addEntry, deleteEntry, getTimer, listEntries, startTimer, stopTimer, updateEntry } from '../services/timeService';
import {
  timeEntryCreateSchema,
  timeEntryPatchSchema,
  timeFilterSchema,
  timerStartSchema,
} from '../types/time';
import { firmOf } from '../types';

// Mounted at /api/time. orgId, userId and role come only from requireFirm (Hard rule 11). Never logs a note (Hard rule 13).

export const timeRoutes = Router();
timeRoutes.use(express.json({ limit: '100kb' }), requireFirm);

const idSchema = z.uuid();

timeRoutes.get('/', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  const viewer = { userId, role };
  const parsed = timeFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid filter' });
    return;
  }
  const entries = await listEntries(orgId, viewer, parsed.data);
  res.status(200).json({ entries });
});

timeRoutes.post('/', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  const viewer = { userId, role };
  const parsed = timeEntryCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await addEntry(orgId, viewer, parsed.data);
  if ('badClient' in outcome) {
    res.status(400).json({ error: 'Unknown entity' });
    return;
  }
  if ('badEngagement' in outcome) {
    res.status(400).json({ error: 'Engagement is not for this entity' });
    return;
  }
  if ('badTask' in outcome) {
    res.status(400).json({ error: 'Task is not in this engagement' });
    return;
  }
  res.status(201).json({ entry: outcome.entry });
});

// Registered before /:id so that 'timer' is not read as a time entry id.
timeRoutes.get('/timer', async (_req, res) => {
  const { orgId, userId, role } = firmOf(res);
  const timer = await getTimer(orgId, { userId, role });
  res.status(200).json({ timer });
});

timeRoutes.post('/timer', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  const viewer = { userId, role };
  const parsed = timerStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await startTimer(orgId, viewer, parsed.data);
  if ('running' in outcome) {
    res.status(409).json({ error: 'A timer is already running' });
    return;
  }
  if ('badClient' in outcome) {
    res.status(400).json({ error: 'Unknown entity' });
    return;
  }
  if ('badEngagement' in outcome) {
    res.status(400).json({ error: 'Engagement is not for this entity' });
    return;
  }
  if ('badTask' in outcome) {
    res.status(400).json({ error: 'Task is not in this engagement' });
    return;
  }
  res.status(201).json({ timer: outcome.timer });
});

timeRoutes.delete('/timer', async (_req, res) => {
  const { orgId, userId, role } = firmOf(res);
  const outcome = await stopTimer(orgId, { userId, role });
  if (!outcome) {
    res.status(404).json({ error: 'No timer is running' });
    return;
  }
  res.status(200).json({ entry: outcome.entry, capped: outcome.capped });
});

timeRoutes.patch('/:id', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  const viewer = { userId, role };
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Time entry not found' });
    return;
  }
  const parsed = timeEntryPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await updateEntry(orgId, viewer, req.params.id, parsed.data);
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Time entry not found' });
    return;
  }
  if ('forbidden' in outcome) {
    res.status(403).json({ error: 'You can only change your own time' });
    return;
  }
  if ('locked' in outcome) {
    res.status(409).json({ error: 'This entry is on an invoice and cannot be changed' });
    return;
  }
  if ('running' in outcome) {
    res.status(409).json({ error: 'Stop the timer first' });
    return;
  }
  res.status(200).json({ entry: outcome.entry });
});

timeRoutes.delete('/:id', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  const viewer = { userId, role };
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Time entry not found' });
    return;
  }
  const outcome = await deleteEntry(orgId, viewer, req.params.id);
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Time entry not found' });
    return;
  }
  if ('forbidden' in outcome) {
    res.status(403).json({ error: 'You can only change your own time' });
    return;
  }
  if ('locked' in outcome) {
    res.status(409).json({ error: 'This entry is on an invoice and cannot be changed' });
    return;
  }
  res.status(204).end();
});
