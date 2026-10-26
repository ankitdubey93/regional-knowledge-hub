import { afterAll, expect, it } from 'vitest';
import { startApp, stopApp } from './server';

afterAll(stopApp);

it('GET /api/health returns ok', async () => {
  const res = await fetch(`${await startApp()}/api/health`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
