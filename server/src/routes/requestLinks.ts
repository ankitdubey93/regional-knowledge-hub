import express, { Router } from 'express';
import { z } from 'zod';
import { env } from '../env';
import { limitByUser } from '../middleware/rateLimit';
import { requireFirm } from '../middleware/session';
import { actorFrom } from '../services/auditEventService';
import { createLink, listLinks, revokeLink, sendLinkEmail, setLinkPaused } from '../services/requestLinkService';
import { requestLinkCreateSchema, requestLinkPatchSchema } from '../types/requestLinks';
import { firmOf } from '../types';

// Mounted at /api/clients/:clientId, before clientRoutes (see app.ts). Never logs an email, token or URL (Hard rule 13).
export const requestLinkRoutes = Router({ mergeParams: true });
requestLinkRoutes.use('/request-links', express.json({ limit: '100kb' }), requireFirm);

const idSchema = z.uuid();

type ClientParams = { clientId: string };
type LinkParams = ClientParams & { linkId: string };

requestLinkRoutes.get<'/request-links', ClientParams>('/request-links', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const links = await listLinks(orgId, req.params.clientId, new Date());
  if (!links) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(200).json({ links });
});

requestLinkRoutes.post<'/request-links', ClientParams>('/request-links', limitByUser('requestLink'), async (req, res) => {
  const { orgId, userId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const parsed = requestLinkCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await createLink(orgId, actorFrom(userId, req.ip), req.params.clientId, parsed.data, new Date());
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  if ('badRequests' in outcome) {
    res.status(422).json({ error: 'Choose open requests for this entity' });
    return;
  }
  const url = `${env.WEB_ORIGIN}/r/${outcome.token}`;
  const emailSent = await sendLinkEmail(orgId, outcome.link, url);
  res.status(201).json({ link: outcome.link, url, emailSent });
});

requestLinkRoutes.patch<'/request-links/:linkId', LinkParams>('/request-links/:linkId', async (req, res) => {
  const { orgId, userId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success || !idSchema.safeParse(req.params.linkId).success) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }
  const parsed = requestLinkPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await setLinkPaused(
    orgId,
    actorFrom(userId, req.ip),
    req.params.clientId,
    req.params.linkId,
    parsed.data.paused,
    new Date(),
  );
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }
  if ('revoked' in outcome) {
    res.status(409).json({ error: 'This link is revoked' });
    return;
  }
  res.status(200).json({ link: outcome.link });
});

requestLinkRoutes.delete<'/request-links/:linkId', LinkParams>('/request-links/:linkId', async (req, res) => {
  const { orgId, userId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success || !idSchema.safeParse(req.params.linkId).success) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }
  const revoked = await revokeLink(orgId, actorFrom(userId, req.ip), req.params.clientId, req.params.linkId);
  if (!revoked) {
    res.status(404).json({ error: 'Link not found' });
    return;
  }
  res.status(204).end();
});
