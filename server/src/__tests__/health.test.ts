import { afterAll, expect, it } from 'vitest';
import { LEGAL_VERSION } from '@chub/shared/lib/legal';
import { startApp, stopApp } from './server';

afterAll(stopApp);

it('GET /api/health returns ok', async () => {
  const res = await fetch(`${await startApp()}/api/health`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

it('ME1 GET /api/meta returns the region and legal version', async () => {
  const res = await fetch(`${await startApp()}/api/meta`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ region: 'AU', otherRegionUrl: null, legalVersion: LEGAL_VERSION });
});
