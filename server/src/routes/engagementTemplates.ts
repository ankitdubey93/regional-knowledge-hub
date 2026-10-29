import express, { Router } from 'express';
import { z } from 'zod';
import { ENGAGEMENT_TEMPLATES } from '@chub/shared/data/engagementTemplates';
import { requireFirm } from '../middleware/session';
import { copySeedTemplate, deleteTemplate, getTemplate, listTemplates, updateTemplate } from '../services/templateService';
import { templateCopySchema, templatePatchSchema } from '../types/engagements';
import { firmOf } from '../types';

// Mounted at /api/engagement-templates. Never logs a template name (Hard rule 13). Role comes only from requireFirm (Hard rule 11).
export const templateRoutes = Router();
templateRoutes.use(express.json({ limit: '100kb' }), requireFirm);

const idSchema = z.uuid();

templateRoutes.get('/', async (_req, res) => {
  const { orgId } = firmOf(res);
  const templates = await listTemplates(orgId);
  res.status(200).json({ seeded: ENGAGEMENT_TEMPLATES.templates, templates });
});

templateRoutes.post('/', async (req, res) => {
  const { orgId, userId } = firmOf(res);
  const parsed = templateCopySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const template = await copySeedTemplate(orgId, userId, parsed.data.seedId);
  if (!template) {
    res.status(400).json({ error: 'Unknown template' });
    return;
  }
  res.status(201).json({ template });
});

templateRoutes.get('/:id', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  const template = await getTemplate(orgId, req.params.id);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.status(200).json({ template });
});

templateRoutes.patch('/:id', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  const parsed = templatePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const template = await updateTemplate(orgId, req.params.id, parsed.data);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.status(200).json({ template });
});

templateRoutes.delete('/:id', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  if (role === 'member') {
    res.status(403).json({ error: 'Only firm owners and admins can delete templates' });
    return;
  }
  const deleted = await deleteTemplate(orgId, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.status(204).end();
});
