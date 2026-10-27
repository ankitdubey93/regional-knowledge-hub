import { Router } from 'express';
import { z } from 'zod';
import { sha256Hex } from '../kb/normalise';
import { getLaw, listLaws, sitePayload } from '../services/kbPublicService';
import { lawQuerySchema } from '../types/kbPublic';

// Public, read-only (Hard rule 16): no session, GET only, published versions only (see kbPublicService).
export const kbRoutes = Router();

kbRoutes.get('/site', async (req, res) => {
  const payload = await sitePayload();
  const etag = `"${sha256Hex(JSON.stringify(payload))}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache');
  if (req.header('If-None-Match') === etag) {
    res.status(304).end();
    return;
  }
  res.status(200).json(payload);
});

kbRoutes.get('/laws', async (req, res) => {
  const parsed = lawQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  res.status(200).json({ laws: await listLaws(parsed.data) });
});

kbRoutes.get('/laws/:id', async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(404).json({ error: 'Law not found' });
    return;
  }
  const law = await getLaw(id.data);
  if (!law) {
    res.status(404).json({ error: 'Law not found' });
    return;
  }
  res.status(200).json({ law });
});
