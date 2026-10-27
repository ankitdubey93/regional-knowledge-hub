import express, { Router, type Response } from 'express';
import { requireAdmin } from '../middleware/admin';
import { adminOf } from '../types';
import { createFact, getFact, listFacts, updateFact } from '../services/factService';
import { factCreateSchema, factListQuerySchema, factUpdateSchema } from '../types/facts';

export const adminFactRoutes = Router();
adminFactRoutes.use(express.json());
adminFactRoutes.use(requireAdmin);

function invalid(res: Response, issues: unknown): void {
  res.status(400).json({ error: 'Invalid input', issues });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// actorId comes only from adminOf(res), which requireAdmin set from the session. Never from the body.
adminFactRoutes.get('/', async (req, res) => {
  const parsed = factListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const facts = await listFacts(parsed.data.q, parsed.data.jurisdiction);
  res.status(200).json({ facts });
});

adminFactRoutes.get('/:key', async (req, res) => {
  const fact = await getFact(req.params.key);
  if (!fact) {
    res.status(404).json({ error: 'Fact not found' });
    return;
  }
  res.status(200).json({ fact });
});

adminFactRoutes.post('/', async (req, res) => {
  const parsed = factCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const { userId: actorId } = adminOf(res);
  const outcome = await createFact(actorId, parsed.data, today());
  if ('result' in outcome) {
    res.status(201).json(outcome.result);
    return;
  }
  if ('conflict' in outcome) {
    res.status(409).json({ error: outcome.conflict });
    return;
  }
  if ('blocked' in outcome) {
    res.status(422).json({ error: 'This fact cannot be saved', issues: outcome.blocked });
    return;
  }
  res.status(404).json({ error: 'Fact not found' });
});

adminFactRoutes.patch('/:key', async (req, res) => {
  const parsed = factUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const { userId: actorId } = adminOf(res);
  const outcome = await updateFact(actorId, req.params.key, parsed.data, today());
  if ('result' in outcome) {
    res.status(200).json(outcome.result);
    return;
  }
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Fact not found' });
    return;
  }
  if ('conflict' in outcome) {
    res.status(409).json({ error: outcome.conflict });
    return;
  }
  res.status(422).json({ error: 'This fact cannot be saved', issues: outcome.blocked });
});
