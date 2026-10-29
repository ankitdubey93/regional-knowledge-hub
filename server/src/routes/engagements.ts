import express, { Router } from 'express';
import { z } from 'zod';
import { requireFirm } from '../middleware/session';
import { addTask, deleteTask, moveTask, updateTask } from '../services/taskService';
import {
  createFromTemplate,
  deleteEngagement,
  getEngagement,
  listClientEngagements,
  listEngagements,
  listMembers,
  openForObligations,
  setAutoEngagements,
  updateEngagement,
} from '../services/engagementService';
import {
  autoEngagementsSchema,
  engagementCreateSchema,
  engagementFilterSchema,
  engagementPatchSchema,
  taskCreateSchema,
  taskMoveSchema,
  taskPatchSchema,
} from '../types/engagements';
import { firmOf } from '../types';

// Mounted at /api/clients/:clientId (client-scoped) and /api/engagements (firm-wide). Never logs a title (Hard rule 13).
// The role comes only from requireFirm, never from a body, query or param (Hard rule 11).

const idSchema = z.uuid();

type ClientParams = { clientId: string };

export const clientEngagementRoutes = Router({ mergeParams: true });
clientEngagementRoutes.use('/engagements', express.json({ limit: '100kb' }), requireFirm);

clientEngagementRoutes.get<'/engagements', ClientParams>('/engagements', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const outcome = await listClientEngagements(orgId, req.params.clientId);
  if (!outcome) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(200).json({ engagements: outcome.engagements, autoEngagements: outcome.autoEngagements });
});

clientEngagementRoutes.post<'/engagements', ClientParams>('/engagements', async (req, res) => {
  const { orgId, userId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const parsed = engagementCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await createFromTemplate(orgId, userId, req.params.clientId, parsed.data);
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  if ('badTemplate' in outcome) {
    res.status(400).json({ error: 'Unknown template' });
    return;
  }
  res.status(201).json({ engagement: outcome.engagement });
});

clientEngagementRoutes.patch<'/engagements/auto', ClientParams>('/engagements/auto', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const parsed = autoEngagementsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const autoEngagements = await setAutoEngagements(orgId, req.params.clientId, parsed.data.enabled);
  if (autoEngagements === null) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(200).json({ autoEngagements });
});

clientEngagementRoutes.post<'/engagements/open', ClientParams>('/engagements/open', async (req, res) => {
  const { orgId, userId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const outcome = await openForObligations(orgId, userId, req.params.clientId, new Date());
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  if ('autoOff' in outcome) {
    res.status(409).json({ error: 'Turn on engagements from due dates for this entity first' });
    return;
  }
  if ('noProfile' in outcome) {
    res.status(422).json({ error: 'Set the entity type, and use one country, to open engagements' });
    return;
  }
  if ('factsMissing' in outcome) {
    res.status(503).json({ error: 'The due-date facts are not loaded' });
    return;
  }
  res.status(200).json({ created: outcome.created, engagements: outcome.engagements });
});

export const engagementRoutes = Router();
engagementRoutes.use(express.json({ limit: '100kb' }), requireFirm);

engagementRoutes.get('/', async (req, res) => {
  const { orgId, userId } = firmOf(res);
  const parsed = engagementFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid filter' });
    return;
  }
  const engagements = await listEngagements(orgId, userId, parsed.data);
  res.status(200).json({ engagements });
});

// Registered before /:id so that 'members' is not read as an engagement id.
engagementRoutes.get('/members', async (_req, res) => {
  const { orgId } = firmOf(res);
  const members = await listMembers(orgId);
  res.status(200).json({ members });
});

engagementRoutes.get('/:id', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Engagement not found' });
    return;
  }
  const outcome = await getEngagement(orgId, req.params.id);
  if (!outcome) {
    res.status(404).json({ error: 'Engagement not found' });
    return;
  }
  res.status(200).json({ engagement: outcome.engagement, tasks: outcome.tasks });
});

engagementRoutes.patch('/:id', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Engagement not found' });
    return;
  }
  const parsed = engagementPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const engagement = await updateEngagement(orgId, req.params.id, parsed.data);
  if (!engagement) {
    res.status(404).json({ error: 'Engagement not found' });
    return;
  }
  res.status(200).json({ engagement });
});

engagementRoutes.delete('/:id', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Engagement not found' });
    return;
  }
  if (role === 'member') {
    res.status(403).json({ error: 'Only firm owners and admins can delete engagements' });
    return;
  }
  const deleted = await deleteEngagement(orgId, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Engagement not found' });
    return;
  }
  res.status(204).end();
});

engagementRoutes.post('/:id/tasks', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Engagement not found' });
    return;
  }
  const parsed = taskCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const task = await addTask(orgId, req.params.id, parsed.data);
  if (!task) {
    res.status(404).json({ error: 'Engagement not found' });
    return;
  }
  res.status(201).json({ task });
});

engagementRoutes.patch('/:id/tasks/:taskId', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success || !idSchema.safeParse(req.params.taskId).success) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  const parsed = taskPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await updateTask(orgId, req.params.id, req.params.taskId, parsed.data);
  if ('badAssignee' in outcome) {
    res.status(400).json({ error: 'Assignee is not a member of this firm' });
    return;
  }
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(200).json({ task: outcome.task });
});

engagementRoutes.post('/:id/tasks/:taskId/move', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success || !idSchema.safeParse(req.params.taskId).success) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  const parsed = taskMoveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const tasks = await moveTask(orgId, req.params.id, req.params.taskId, parsed.data.direction);
  if (!tasks) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(200).json({ tasks });
});

engagementRoutes.delete('/:id/tasks/:taskId', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success || !idSchema.safeParse(req.params.taskId).success) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  const deleted = await deleteTask(orgId, req.params.id, req.params.taskId);
  if (!deleted) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.status(204).end();
});
