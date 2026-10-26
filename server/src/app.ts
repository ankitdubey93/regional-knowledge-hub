import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth';
import { env } from './env';
import { clientRoutes } from './routes/clients';

export const app = express();

// No global express.json(): Better Auth's handler (Step 12) must read the raw body itself.
app.use('/api', cors({ origin: env.WEB_ORIGIN, credentials: true, allowedHeaders: ['Content-Type'], methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.all('/api/auth/*splat', toNodeHandler(auth));
app.use('/api/clients', clientRoutes);
