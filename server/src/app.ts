import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth';
import { env } from './env';
import { adminFactRoutes } from './routes/adminFacts';
import { adminKbRoutes } from './routes/adminKb';
import { adminRoutes } from './routes/admin';
import { chatStatusRoutes, conversationRoutes } from './routes/conversations';
import { clientRoutes } from './routes/clients';
import { documentRoutes } from './routes/documents';
import { kbRoutes } from './routes/kb';
import { requestRoutes } from './routes/requests';
import { clientEngagementRoutes, engagementRoutes } from './routes/engagements';
import { templateRoutes } from './routes/engagementTemplates';
import { ledgerRoutes } from './routes/ledger';

export const app = express();

// No global express.json(): Better Auth's handler (Step 12) must read the raw body itself.
app.use('/api', cors({ origin: env.WEB_ORIGIN, credentials: true, allowedHeaders: ['Content-Type', 'X-Filename'], methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.all('/api/auth/*splat', toNodeHandler(auth));
app.use('/api/kb', kbRoutes);
app.use('/api/clients/:clientId', documentRoutes);
app.use('/api/clients/:clientId', requestRoutes);
app.use('/api/clients/:clientId', clientEngagementRoutes);
app.use('/api/clients/:clientId', ledgerRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/engagements', engagementRoutes);
app.use('/api/engagement-templates', templateRoutes);
app.use('/api/chat', chatStatusRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/admin/facts', adminFactRoutes);
app.use('/api/admin/kb', adminKbRoutes);
app.use('/api/admin', adminRoutes);
