import express, { Router, type ErrorRequestHandler, type Response } from 'express';
import { z } from 'zod';
import { currentEmbedder, EmbeddingError } from '../ai/embed';
import { ExtractError, extractFile, fileKindOf } from '../kb/extract';
import { FetchError, fetchOfficial } from '../kb/fetchOfficial';
import { searchKb } from '../kb/retrieve';
import { requireAdmin } from '../middleware/admin';
import {
  createDraft,
  createSource,
  embedMissing,
  getSource,
  getVersionDetail,
  listSources,
  publishedBody,
  publishVersion,
  setOfficialUrlIfMissing,
  updateDraft,
  updateSource,
  withdrawVersion,
} from '../services/kbService';
import { adminOf } from '../types';
import {
  draftCreateSchema,
  searchInputSchema,
  sourceFilterSchema,
  sourceInputSchema,
  sourcePatchSchema,
  versionMetaSchema,
  versionPatchSchema,
} from '../types/kb';

export const adminKbRoutes = Router();
adminKbRoutes.use(requireAdmin);

const idSchema = z.uuid();

function invalid(res: Response, issues: unknown): void {
  res.status(400).json({ error: 'Invalid input', issues });
}

// Raw file bodies: this route is registered before express.json so the JSON parser never sees it.
adminKbRoutes.post('/sources/:id/versions/upload', express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  const query: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req.query)) {
    query[k] = typeof v === 'string' && v === '' && (k === 'effectiveFrom' || k === 'effectiveTo') ? null : v;
  }
  const parsed = versionMetaSchema.safeParse(query);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  let name = '';
  try {
    name = decodeURIComponent(req.header('X-Filename') ?? '');
  } catch {
    name = '';
  }
  const kind = name === '' ? null : fileKindOf(name);
  if (kind === null) {
    res.status(415).json({ error: 'Unsupported file type. Use .txt, .md, .html, .pdf or .docx' });
    return;
  }
  const bytes: unknown = req.body;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    res.status(400).json({ error: 'The file is empty' });
    return;
  }
  let text: string;
  try {
    text = await extractFile(kind, bytes);
  } catch (e) {
    if (e instanceof ExtractError) {
      res.status(422).json({ error: e.message });
      return;
    }
    throw e;
  }
  const { userId: actorId } = adminOf(res);
  const outcome = await createDraft(actorId, req.params.id, parsed.data, { method: 'file', text, originalName: name });
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  if ('conflict' in outcome) {
    res.status(409).json({ error: outcome.conflict });
    return;
  }
  res.status(201).json({ detail: outcome.detail });
});

adminKbRoutes.use(express.json({ limit: '5mb' }));

// actorId comes only from adminOf(res), which requireAdmin set from the session. Never from the body.
adminKbRoutes.get('/sources', async (req, res) => {
  const parsed = sourceFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const sources = await listSources(parsed.data);
  res.status(200).json({ sources });
});

adminKbRoutes.post('/sources', async (req, res) => {
  const parsed = sourceInputSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const { userId: actorId } = adminOf(res);
  const source = await createSource(actorId, parsed.data);
  res.status(201).json({ source });
});

adminKbRoutes.get('/sources/:id', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  const found = await getSource(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  res.status(200).json({ source: found.source, versions: found.versions });
});

adminKbRoutes.patch('/sources/:id', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  const parsed = sourcePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const { userId: actorId } = adminOf(res);
  const source = await updateSource(actorId, req.params.id, parsed.data);
  if (!source) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  res.status(200).json({ source });
});

adminKbRoutes.post('/sources/:id/versions', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  const parsed = draftCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const data = parsed.data;
  const { userId: actorId } = adminOf(res);
  const id = req.params.id;
  const meta = {
    label: data.label,
    effectiveFrom: data.effectiveFrom,
    effectiveTo: data.effectiveTo,
    retrievedOn: data.retrievedOn,
    changeNote: data.changeNote,
  };

  let outcome;
  if (data.method === 'url') {
    let fetched;
    let text: string;
    try {
      fetched = await fetchOfficial(data.url);
      text = await extractFile(fetched.kind, fetched.bytes);
    } catch (e) {
      if (e instanceof FetchError || e instanceof ExtractError) {
        res.status(422).json({ error: e.message });
        return;
      }
      throw e;
    }
    // Set before createDraft so validation sees the official URL.
    await setOfficialUrlIfMissing(id, fetched.finalUrl);
    outcome = await createDraft(actorId, id, meta, { method: 'url', text, originalName: fetched.finalUrl });
  } else if (data.method === 'paste') {
    outcome = await createDraft(actorId, id, meta, { method: 'paste', text: data.text, originalName: null });
  } else {
    const source = await getSource(id);
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }
    const body = await publishedBody(id);
    if (body === null) {
      res.status(409).json({ error: 'This source has no published version to copy' });
      return;
    }
    outcome = await createDraft(actorId, id, meta, { method: 'copy', text: body, originalName: null });
  }
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  if ('conflict' in outcome) {
    res.status(409).json({ error: outcome.conflict });
    return;
  }
  res.status(201).json({ detail: outcome.detail });
});

adminKbRoutes.get('/versions/:id', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  const detail = await getVersionDetail(req.params.id);
  if (!detail) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  res.status(200).json({ detail });
});

adminKbRoutes.patch('/versions/:id', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  const parsed = versionPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const { userId: actorId } = adminOf(res);
  const outcome = await updateDraft(actorId, req.params.id, parsed.data);
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  if ('conflict' in outcome) {
    res.status(409).json({ error: outcome.conflict });
    return;
  }
  res.status(200).json({ detail: outcome.detail });
});

adminKbRoutes.post('/versions/:id/publish', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  const { userId: actorId } = adminOf(res);
  const outcome = await publishVersion(actorId, req.params.id, currentEmbedder());
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  if ('conflict' in outcome) {
    res.status(409).json({ error: outcome.conflict });
    return;
  }
  if ('blocked' in outcome) {
    res.status(422).json({ error: 'Fix the blocking issues before publishing', issues: outcome.blocked });
    return;
  }
  if ('embedFailed' in outcome) {
    res.status(502).json({ error: 'Could not embed the text; try again' });
    return;
  }
  res.status(200).json({ detail: outcome.detail });
});

adminKbRoutes.post('/versions/:id/withdraw', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  const { userId: actorId } = adminOf(res);
  const outcome = await withdrawVersion(actorId, req.params.id);
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  if ('conflict' in outcome) {
    res.status(409).json({ error: outcome.conflict });
    return;
  }
  res.status(200).json({ detail: outcome.detail });
});

adminKbRoutes.post('/search', async (req, res) => {
  const parsed = searchInputSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  // The admin's own test query is the only query text sent to the embedder (plan, Decisions). A failure falls back to keyword search.
  const e = currentEmbedder();
  let vec: number[] | null = null;
  if (e) {
    try {
      vec = (await e.embed([parsed.data.query], 'RETRIEVAL_QUERY'))[0] ?? null;
    } catch {
      vec = null;
    }
  }
  const response = await searchKb(parsed.data, vec);
  res.status(200).json(response);
});

adminKbRoutes.post('/embed-missing', async (_req, res) => {
  const embedder = currentEmbedder();
  if (embedder === null) {
    res.status(409).json({ error: 'Embeddings are not configured: set GEMINI_API_KEY' });
    return;
  }
  const { userId: actorId } = adminOf(res);
  try {
    const out = await embedMissing(actorId, embedder);
    res.status(200).json(out);
  } catch (e) {
    if (e instanceof EmbeddingError) {
      res.status(502).json({ error: 'Could not embed the text; try again' });
      return;
    }
    throw e;
  }
});

// Must stay last so it catches parser errors from the routes above.
const bodyErrors: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  const type = typeof err === 'object' && err !== null && 'type' in err ? (err as { type: unknown }).type : undefined;
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'Too large: files up to 20 MB, pasted text up to 5 MB' });
    return;
  }
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }
  next(err);
};
adminKbRoutes.use(bodyErrors);
