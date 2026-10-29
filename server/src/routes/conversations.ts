import express, { Router, type Response } from 'express';
import { z } from 'zod';
import { limitByUser } from '../middleware/rateLimit';
import { requireFirm } from '../middleware/session';
import { env } from '../env';
import { currentChatProvider } from '../ai/chat';
import { currentEmbedder } from '../ai/embed';
import { openSse, sendSse } from '../chat/sse';
import {
  attachDocument,
  createConversation,
  conversationContext,
  deleteConversation,
  detachDocument,
  getConversation,
  listConversations,
  renameConversation,
} from '../services/conversationService';
import { checkGuard } from '../services/usageService';
import { runExchange } from '../services/chatService';
import { firmOf } from '../types';
import {
  CHAT_MESSAGES,
  conversationCreateSchema,
  conversationPatchSchema,
  listQuerySchema,
  messageInputSchema,
} from '../types/chat';

// orgId, userId and role come only from firmOf(res), which requireFirm set from the session (Hard rule 11).
// Nothing here logs a message body (Hard rule 13).
export const conversationRoutes = Router();
conversationRoutes.use(express.json({ limit: '64kb' }), requireFirm);

export const chatStatusRoutes = Router();
chatStatusRoutes.use(requireFirm);

const idSchema = z.uuid();

type IdParams = { id: string };

function invalid(res: Response, issues: unknown): void {
  res.status(400).json({ error: 'Invalid input', issues });
}

function chatNotFound(res: Response): void {
  res.status(404).json({ error: 'Chat not found' });
}

function clientNotFound(res: Response): void {
  res.status(404).json({ error: 'Client not found' });
}

chatStatusRoutes.get('/status', (_req, res) => {
  const p = currentChatProvider();
  res.json({
    configured: p !== null,
    provider: p?.name ?? env.CHAT_PROVIDER,
    model: p?.model ?? null,
    embeddings: currentEmbedder() !== null,
  });
});

conversationRoutes.get('/', async (req, res) => {
  const { orgId } = firmOf(res);
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const clientId = parsed.data.clientId === 'none' ? null : parsed.data.clientId;
  const conversations = await listConversations(orgId, clientId);
  if (!conversations) {
    clientNotFound(res);
    return;
  }
  res.status(200).json({ conversations });
});

conversationRoutes.post('/', async (req, res) => {
  const { orgId, userId } = firmOf(res);
  const parsed = conversationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const conversation = await createConversation(orgId, userId, parsed.data);
  if (!conversation) {
    clientNotFound(res);
    return;
  }
  res.status(201).json({ conversation });
});

conversationRoutes.get<'/:id', IdParams>('/:id', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    chatNotFound(res);
    return;
  }
  const found = await getConversation(orgId, req.params.id);
  if (!found) {
    chatNotFound(res);
    return;
  }
  res.status(200).json(found);
});

conversationRoutes.patch<'/:id', IdParams>('/:id', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    chatNotFound(res);
    return;
  }
  const parsed = conversationPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const outcome = await renameConversation(orgId, { userId, role }, req.params.id, parsed.data.title);
  if ('notFound' in outcome) {
    chatNotFound(res);
    return;
  }
  if ('forbidden' in outcome) {
    res.status(403).json({ error: CHAT_MESSAGES.notYours });
    return;
  }
  res.status(200).json({ conversation: outcome.conversation });
});

conversationRoutes.delete<'/:id', IdParams>('/:id', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    chatNotFound(res);
    return;
  }
  const outcome = await deleteConversation(orgId, { userId, role }, req.params.id);
  if (outcome === 'not_found') {
    chatNotFound(res);
    return;
  }
  if (outcome === 'forbidden') {
    res.status(403).json({ error: CHAT_MESSAGES.notYours });
    return;
  }
  res.status(204).end();
});

const attachSchema = z.object({ documentId: z.uuid() });

conversationRoutes.post<'/:id/documents', IdParams>('/:id/documents', async (req, res) => {
  const { orgId, userId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    chatNotFound(res);
    return;
  }
  const parsed = attachSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const outcome = await attachDocument(orgId, userId, req.params.id, parsed.data.documentId);
  if ('notFound' in outcome) {
    if (outcome.notFound === 'chat') chatNotFound(res);
    else res.status(404).json({ error: 'Document not found' });
    return;
  }
  res.status(200).json({ documents: outcome.documents });
});

conversationRoutes.delete<'/:id/documents/:documentId', IdParams & { documentId: string }>(
  '/:id/documents/:documentId',
  async (req, res) => {
    const { orgId } = firmOf(res);
    if (!idSchema.safeParse(req.params.id).success) {
      chatNotFound(res);
      return;
    }
    if (!idSchema.safeParse(req.params.documentId).success) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const outcome = await detachDocument(orgId, req.params.id, req.params.documentId);
    if ('notFound' in outcome) {
      if (outcome.notFound === 'chat') chatNotFound(res);
      else res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.status(200).json({ documents: outcome.documents });
  },
);

// Order: uuid check, body (400), conversation (404), provider (503), guard (429), then the stream.
conversationRoutes.post<'/:id/messages', IdParams>('/:id/messages', limitByUser('chatMessage'), async (req, res) => {
  const { orgId, userId } = firmOf(res);
  const id = req.params.id;
  if (!idSchema.safeParse(id).success) {
    chatNotFound(res);
    return;
  }
  const parsed = messageInputSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const ctx = await conversationContext(orgId, id);
  if (!ctx) {
    chatNotFound(res);
    return;
  }
  const provider = currentChatProvider();
  if (!provider) {
    res.status(503).json({ error: CHAT_MESSAGES.notConfigured });
    return;
  }
  const guard = await checkGuard(userId, new Date());
  if (!guard.ok) {
    const error = guard.reason === 'user_limit' ? CHAT_MESSAGES.userLimit(guard.limit) : CHAT_MESSAGES.spendCap;
    res.status(429).json({ error });
    return;
  }

  openSse(res);
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) ac.abort();
  });
  try {
    await runExchange(
      orgId,
      userId,
      id,
      parsed.data.text,
      provider,
      {
        start: (m) => sendSse(res, 'start', { userMessage: m }),
        sources: (s) => sendSse(res, 'sources', { sources: s }),
        delta: (t) => sendSse(res, 'delta', { text: t }),
        done: (m) => sendSse(res, 'done', { message: m }),
        signal: ac.signal,
      },
      new Date(),
    );
  } catch {
    sendSse(res, 'error', { error: CHAT_MESSAGES.failed });
  } finally {
    res.end();
  }
});
