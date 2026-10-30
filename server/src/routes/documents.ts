import express, { Router, type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { DocumentRejected, documentKindOf, extractDocument } from '../documents/extract';
import { limitByUser } from '../middleware/rateLimit';
import { requireFirm } from '../middleware/session';
import { MAX_DOCUMENTS_PER_CLIENT, deleteDocument, listDocuments, readDocumentFile, uploadDocument } from '../services/documentService';
import { actorFrom } from '../services/auditEventService';
import { firmOf } from '../types';

// Mounted at /api/clients/:clientId, before ledgerRoutes (see app.ts). Never logs a name, bytes or text (Hard rule 13).
export const documentRoutes = Router({ mergeParams: true });
documentRoutes.use('/documents', requireFirm);

const idSchema = z.uuid();

type ClientParams = { clientId: string };
type DocParams = ClientParams & { docId: string };

const UNSUPPORTED = 'Upload a PDF, Word (.docx), Excel (.xlsx), CSV, text or Markdown file';

documentRoutes.get<'/documents', ClientParams>('/documents', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const documents = await listDocuments(orgId, req.params.clientId);
  if (!documents) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(200).json({ documents });
});

documentRoutes.post<'/documents', ClientParams>('/documents', limitByUser('upload'), express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
  const { orgId, userId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
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
  const outcome = await uploadDocument(orgId, actorFrom(userId, req.ip), req.params.clientId, {
    name,
    kind,
    bytes,
    text: extracted.text,
    truncated: extracted.truncated,
  });
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  if ('full' in outcome) {
    res.status(409).json({ error: `This entity already has ${MAX_DOCUMENTS_PER_CLIENT} documents. Delete some first.` });
    return;
  }
  res.status(outcome.created ? 201 : 200).json({ document: outcome.document });
});

documentRoutes.get<'/documents/:docId/file', DocParams>('/documents/:docId/file', async (req, res) => {
  const { orgId, userId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success || !idSchema.safeParse(req.params.docId).success) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  const file = await readDocumentFile(orgId, actorFrom(userId, req.ip), req.params.clientId, req.params.docId);
  if (!file) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.status(200);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.end(file.bytes);
});

documentRoutes.delete<'/documents/:docId', DocParams>('/documents/:docId', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success || !idSchema.safeParse(req.params.docId).success) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  if (role === 'member') {
    res.status(403).json({ error: 'Only firm owners and admins can delete documents' });
    return;
  }
  const deleted = await deleteDocument(orgId, actorFrom(userId, req.ip), req.params.clientId, req.params.docId);
  if (!deleted) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.status(204).end();
});

// Must stay last so it catches parser errors from the routes above.
const bodyErrors: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  const type = typeof err === 'object' && err !== null && 'type' in err ? (err as { type: unknown }).type : undefined;
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'Files can be up to 20 MB' });
    return;
  }
  next(err);
};
documentRoutes.use(bodyErrors);
