import express, { Router } from 'express';
import { z } from 'zod';
import { requireFirm } from '../middleware/session';
import { addRequest, deleteRequest, generateRequests, listRequests, updateRequest } from '../services/requestService';
import { requestCreateSchema, requestPatchSchema } from '../types/requests';
import { firmOf } from '../types';

// Mounted at /api/clients/:clientId, before clientRoutes (see app.ts). Never logs a label (Hard rule 13).
export const requestRoutes = Router({ mergeParams: true });
requestRoutes.use('/requests', express.json({ limit: '100kb' }), requireFirm);

const idSchema = z.uuid();

type ClientParams = { clientId: string };
type RequestParams = ClientParams & { requestId: string };

requestRoutes.get<'/requests', ClientParams>('/requests', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const requests = await listRequests(orgId, req.params.clientId);
  if (!requests) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(200).json({ requests });
});

requestRoutes.post<'/requests/generate', ClientParams>('/requests/generate', async (req, res) => {
  const { orgId, userId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const outcome = await generateRequests(orgId, userId, req.params.clientId, new Date());
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  if ('noProfile' in outcome) {
    res.status(422).json({ error: 'Set the entity type, and use one country, to generate requests' });
    return;
  }
  if ('factsMissing' in outcome) {
    res.status(503).json({ error: 'The due-date facts are not loaded' });
    return;
  }
  res.status(200).json({ created: outcome.created, requests: outcome.requests });
});

requestRoutes.post<'/requests', ClientParams>('/requests', async (req, res) => {
  const { orgId, userId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const parsed = requestCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const request = await addRequest(orgId, userId, req.params.clientId, parsed.data);
  if (!request) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(201).json({ request });
});

requestRoutes.patch<'/requests/:requestId', RequestParams>('/requests/:requestId', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success || !idSchema.safeParse(req.params.requestId).success) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }
  const parsed = requestPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const request = await updateRequest(orgId, req.params.clientId, req.params.requestId, parsed.data);
  if (!request) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }
  res.status(200).json({ request });
});

requestRoutes.delete<'/requests/:requestId', RequestParams>('/requests/:requestId', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success || !idSchema.safeParse(req.params.requestId).success) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }
  if (role === 'member') {
    res.status(403).json({ error: 'Only firm owners and admins can delete requests' });
    return;
  }
  const deleted = await deleteRequest(orgId, req.params.clientId, req.params.requestId);
  if (!deleted) {
    res.status(404).json({ error: 'Request not found' });
    return;
  }
  res.status(204).end();
});
