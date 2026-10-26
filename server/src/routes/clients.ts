import express, { Router, type Response } from 'express';
import { z } from 'zod';
import { requireFirm } from '../middleware/session';
import { createClient, deleteClient, getClient, listClients, updateClient } from '../services/clientService';
import { firmOf } from '../types';
import { clientInputSchema, clientPatchSchema } from '../types/clients';

export const clientRoutes = Router();
clientRoutes.use(express.json());
clientRoutes.use(requireFirm);

const idSchema = z.uuid();

function invalid(res: Response, issues: unknown): void {
  res.status(400).json({ error: 'Invalid input', issues });
}

// orgId and userId come only from firmOf(res), which requireFirm set from the session (Hard rule 11).
clientRoutes.get('/', async (_req, res) => {
  const { orgId } = firmOf(res);
  const clients = await listClients(orgId);
  res.status(200).json({ clients });
});

clientRoutes.post('/', async (req, res) => {
  const parsed = clientInputSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const { orgId, userId } = firmOf(res);
  const client = await createClient(orgId, userId, parsed.data);
  res.status(201).json({ client });
});

clientRoutes.get('/:id', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const client = await getClient(orgId, req.params.id);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(200).json({ client });
});

clientRoutes.patch('/:id', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const parsed = clientPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const client = await updateClient(orgId, req.params.id, parsed.data);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(200).json({ client });
});

clientRoutes.delete('/:id', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  if (role === 'member') {
    res.status(403).json({ error: 'Only firm owners and admins can delete clients' });
    return;
  }
  const deleted = await deleteClient(orgId, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(204).end();
});
