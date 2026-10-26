import express, { Router, type Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { requireAdmin } from '../middleware/admin';
import { currentEmbedder } from '../ai/embed';
import { banUser, countUsers, listUsers, unbanUser } from '../services/adminUserService';
import { kbOverviewCounts } from '../services/kbService';
import { adminOf } from '../types';
import { USERS_PAGE_SIZE, banBodySchema, userListQuerySchema } from '../types/admin';

export const adminRoutes = Router();
adminRoutes.use(express.json());
adminRoutes.use(requireAdmin);

function invalid(res: Response, issues: unknown): void {
  res.status(400).json({ error: 'Invalid input', issues });
}

// actorId comes only from adminOf(res), which requireAdmin set from the session. Never from the body.
adminRoutes.get('/users', async (req, res) => {
  const parsed = userListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const { q, page } = parsed.data;
  const { users, total } = await listUsers(q, page);
  res.status(200).json({ users, total, page, pageSize: USERS_PAGE_SIZE });
});

adminRoutes.post('/users/:id/ban', async (req, res) => {
  const parsed = banBodySchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const { userId: actorId } = adminOf(res);
  const outcome = await banUser(actorId, fromNodeHeaders(req.headers), req.params.id, parsed.data.reason);
  if (outcome === 'self') {
    res.status(400).json({ error: 'You cannot ban yourself' });
    return;
  }
  if (outcome === 'not_found') {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.status(200).json({ ok: true });
});

adminRoutes.post('/users/:id/unban', async (req, res) => {
  const { userId: actorId } = adminOf(res);
  const outcome = await unbanUser(actorId, fromNodeHeaders(req.headers), req.params.id);
  if (outcome === 'not_found') {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.status(200).json({ ok: true });
});

adminRoutes.get('/overview', async (_req, res) => {
  res.status(200).json({ users: await countUsers(), ...await kbOverviewCounts(), embeddingsEnabled: currentEmbedder() !== null });
});
