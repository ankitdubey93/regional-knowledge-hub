import path from 'node:path';
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
import { requestLinkRoutes } from './routes/requestLinks';
import { publicRequestRoutes } from './routes/publicRequests';
import { clientEngagementRoutes, engagementRoutes } from './routes/engagements';
import { templateRoutes } from './routes/engagementTemplates';
import { auditRoutes } from './routes/audit';
import { workloadRoutes } from './routes/workload';
import { timeRoutes } from './routes/time';
import { workspaceRoutes } from './routes/workspace';
import { ledgerRoutes } from './routes/ledger';
import { metaRoutes } from './routes/meta';
import { pinForwardedFor } from './middleware/rateLimit';

export const app = express();
app.set('trust proxy', env.TRUST_PROXY_HOPS);

// No global express.json(): Better Auth's handler (Step 12) must read the raw body itself.
app.use('/api', cors({ origin: env.WEB_ORIGIN, credentials: true, allowedHeaders: ['Content-Type', 'X-Filename'], methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/meta', metaRoutes);
app.all('/api/auth/*splat', pinForwardedFor, toNodeHandler(auth));
app.use('/api/kb', kbRoutes);
app.use('/api/public/requests', publicRequestRoutes);
app.use('/api/clients/:clientId', documentRoutes);
app.use('/api/clients/:clientId', requestRoutes);
app.use('/api/clients/:clientId', requestLinkRoutes);
app.use('/api/clients/:clientId', clientEngagementRoutes);
app.use('/api/clients/:clientId', ledgerRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/engagements', engagementRoutes);
app.use('/api/engagement-templates', templateRoutes);
app.use('/api/workload', workloadRoutes);
app.use('/api/time', timeRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/chat', chatStatusRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/admin/facts', adminFactRoutes);
app.use('/api/admin/kb', adminKbRoutes);
app.use('/api/admin', adminRoutes);

// P5d: in the production image the API also serves the built web app (one origin). Never reached by /api paths.
if (env.WEB_DIST_DIR) {
  const webDir = env.WEB_DIST_DIR;
  const baseHeaders = (res: express.Response, cache: string): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', cache);
  };
  app.use(
    express.static(webDir, {
      index: false,
      setHeaders(res, filePath) {
        baseHeaders(res, filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  app.get('/{*splat}', (req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      next();
      return;
    }
    baseHeaders(res, 'no-cache');
    res.sendFile(path.join(webDir, 'index.html'));
  });
}
