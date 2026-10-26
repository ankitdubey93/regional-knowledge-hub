import type { Server } from 'node:http';
import { app } from '../app';

// Tests reach the app over loopback on an ephemeral port; nothing leaves the machine (Hard rule 15).
let server: Server | undefined;
let base = '';

export async function startApp(): Promise<string> {
  if (server) return base;
  const s = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const addr = s.address();
  if (addr === null || typeof addr === 'string') throw new Error('test server has no port');
  server = s;
  base = `http://127.0.0.1:${addr.port}`;
  return base;
}

export async function stopApp(): Promise<void> {
  const s = server;
  if (!s) return;
  server = undefined;
  await new Promise<void>((resolve, reject) => s.close((err) => (err ? reject(err) : resolve())));
}
