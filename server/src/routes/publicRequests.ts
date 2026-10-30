import express, { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import { z } from 'zod';
import { DocumentRejected, documentKindOf, extractDocument } from '../documents/extract';
import { limitByIp } from '../middleware/rateLimit';
import { ipKey } from '../services/rateLimitService';
import { publicItem, publicView, resolveLink, uploadForRequest } from '../services/requestLinkService';

// Public (no session) routes for a client's request link (C3). Every bad, expired or revoked token gets the same 404. Never logs a token, name, bytes or text (Hard rule 13).
export const publicRequestRoutes = Router();

const INVALID = 'This link is not valid or has expired';
const NOT_ON_LINK = 'This item is not on this link';
const UNSUPPORTED = 'Upload a PDF, Word (.docx), Excel (.xlsx), CSV, text or Markdown file';
const FULL = 'This upload could not be accepted. Ask the firm for help.';

const idSchema = z.uuid();

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
};
publicRequestRoutes.use(noStore);

publicRequestRoutes.get<'/:token', { token: string }>('/:token', limitByIp('publicView'), async (req, res) => {
  const resolved = await resolveLink(req.params.token);
  if (!resolved) {
    res.status(404).json({ error: INVALID });
    return;
  }
  const view = await publicView(resolved);
  if (!view) {
    res.status(404).json({ error: INVALID });
    return;
  }
  res.status(200).json({ request: view });
});

publicRequestRoutes.post<'/:token/items/:requestId/upload', { token: string; requestId: string }>(
  '/:token/items/:requestId/upload',
  limitByIp('publicUpload'), express.raw({ type: () => true, limit: '20mb' }),
  async (req, res) => {
    const resolved = await resolveLink(req.params.token);
    if (!resolved) {
      res.status(404).json({ error: INVALID });
      return;
    }
    const { requestId } = req.params;
    if (!idSchema.safeParse(requestId).success || (await publicItem(resolved, requestId)) === null) {
      res.status(404).json({ error: NOT_ON_LINK });
      return;
    }
    let name = '';
    try {
      name = decodeURIComponent(req.header('X-Filename') ?? '').trim();
    } catch {
      name = '';
    }
    if (name.length < 1 || name.length > 200) {
      res.status(400).json({ error: 'Missing file name' });
      return;
    }
    const bytes: unknown = req.body;
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      res.status(400).json({ error: 'Empty file' });
      return;
    }
    const kind = documentKindOf(name);
    if (kind === null) {
      res.status(415).json({ error: UNSUPPORTED });
      return;
    }
    let extracted: { text: string; truncated: boolean };
    try {
      extracted = await extractDocument(kind, bytes, name);
    } catch (e) {
      if (e instanceof DocumentRejected) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }
    const outcome = await uploadForRequest(resolved, req.ip ? ipKey(req.ip) : null, requestId, {
      name,
      kind,
      bytes,
      text: extracted.text,
      truncated: extracted.truncated,
    });
    if ('notOnLink' in outcome) {
      res.status(404).json({ error: NOT_ON_LINK });
      return;
    }
    if ('full' in outcome) {
      res.status(409).json({ error: FULL });
      return;
    }
    res.status(outcome.created ? 201 : 200).json({ item: outcome.item });
  },
);

// Must stay last so it catches parser errors from the routes above.
const bodyErrors: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  const type = typeof err === 'object' && err !== null && 'type' in err ? (err as { type: unknown }).type : undefined;
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'Files can be up to 20 MB' });
    return;
  }
  next(err);
};
publicRequestRoutes.use(bodyErrors);
