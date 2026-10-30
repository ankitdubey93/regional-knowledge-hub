import { afterAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const p = await import('node:path');
  const dir = fs.mkdtempSync(p.join(os.tmpdir(), 'chub-web-'));
  fs.writeFileSync(p.join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
  fs.mkdirSync(p.join(dir, 'assets'));
  fs.writeFileSync(p.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  process.env.WEB_DIST_DIR = dir;
});

import { stopApp } from './server';

afterAll(async () => {
  await stopApp();
});

async function get(path: string): Promise<Response> {
  const { startApp } = await import('./server');
  return fetch(`${await startApp()}${path}`);
}

describe('web static serving', () => {
  it('WS1 the root serves index.html', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="root"');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('WS2 a client route falls back to index.html', async () => {
    for (const p of ['/r/abc', '/entities/x/requests']) {
      const res = await get(p);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('id="root"');
    }
  });

  it('WS3 hashed assets are cached for a year', async () => {
    const res = await get('/assets/app-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('WS4 an unknown API path never gets the app', async () => {
    const res = await get('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('id="root"');
  });

  it('WS5 the API still answers', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
