import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import factsJson from '@chub/shared/seed/facts.json';
import { factsSchema } from '@chub/shared/data/schemas';
import type { EntityProfit } from '@chub/shared/utils/profitability';
import { auth } from '../auth';
import { pool } from '../db/client';
import { seedFacts } from '../kb/seedFacts';
import { call, createFirm, mergeCookies, signUp } from './helpers';
import { startApp, stopApp } from './server';

const all = factsSchema.parse(factsJson);

let cookieA = '';
let memberCookie = '';
let cookieB = '';
let cookieC = '';
let harbour = '';
let bay = '';
let bFirmClient = '';
let cove = '';
let basQ1 = '';
let bayDraft = '';

const october = '/api/profitability?from=2026-10-01&to=2026-10-31';
const period = { from: '2026-10-01', to: '2026-10-31' };

async function ok(res: Response, status: number, what: string): Promise<unknown> {
  const text = await res.text();
  if (res.status !== status) throw new Error(`${what} failed: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function makeClient(cookie: string, name: string): Promise<string> {
  const c = await call('POST', '/api/clients', {
    cookie,
    body: { name, jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6, taxRegistered: true, taxPeriod: 'quarterly' },
  });
  return ((await ok(c, 201, 'create client')) as { client: { id: string } }).client.id;
}

async function patch(path: string, cookie: string, body: unknown): Promise<void> {
  await ok(await call('PATCH', path, { cookie, body }), 200, `PATCH ${path}`);
}

async function setupFirm(cookie: string, legalName: string, cost: number | null): Promise<void> {
  await patch('/api/billing/settings', cookie, {
    jurisdiction: 'AU',
    legalName,
    address: '1 Test St Sydney NSW 2000',
    taxRegistered: true,
    taxNumber: '12345678901',
  });
  await patch('/api/billing/rates', cookie, {
    userId: null,
    currency: 'AUD',
    centsPerHour: 15000,
    ...(cost === null ? {} : { costCentsPerHour: cost }),
  });
}

async function addTime(cookie: string, body: Record<string, unknown>): Promise<void> {
  await ok(await call('POST', '/api/time', { cookie, body }), 201, 'add time');
}

async function draft(cookie: string, clientId: string): Promise<string> {
  const res = await call('POST', '/api/invoices', { cookie, body: { clientId, ...period } });
  return ((await ok(res, 201, 'create draft')) as { invoice: { id: string } }).invoice.id;
}

async function issue(cookie: string, id: string): Promise<void> {
  await ok(await call('POST', `/api/invoices/${id}/issue`, { cookie, body: { issuedOn: '2026-10-31' } }), 200, 'issue');
}

async function report(cookie: string, path: string): Promise<{ status: number; json: any }> {
  const res = await call('GET', path, { cookie });
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  await startApp();
  const today = new Date().toISOString().slice(0, 10);
  await seedFacts({ 'au.gst.rate': all['au.gst.rate']!, 'uk.vat.standardRate': all['uk.vat.standardRate']! }, today);

  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Profit Firm A');
  cookieA = firmA.cookie;
  const m = await signUp();
  await auth.api.addMember({ body: { userId: m.userId, organizationId: firmA.orgId, role: 'member' } });
  const active = await call('POST', '/api/auth/organization/set-active', {
    cookie: m.cookie,
    body: { organizationId: firmA.orgId },
  });
  if (active.status !== 200) throw new Error(`member set-active failed: ${active.status}`);
  memberCookie = mergeCookies(m.cookie, active);
  await setupFirm(cookieA, 'Profit Firm A Pty Ltd', 6000);

  harbour = await makeClient(cookieA, 'Harbour Lane Pty Ltd');
  bay = await makeClient(cookieA, 'Bay Books Pty Ltd');
  await patch(`/api/clients/${harbour}/pricing`, cookieA, { model: 'hourly', currency: 'AUD' });
  await patch(`/api/clients/${bay}/pricing`, cookieA, { model: 'hourly', currency: 'AUD' });

  const eng = await call('POST', `/api/clients/${harbour}/engagements`, {
    cookie: cookieA,
    body: { templateId: 'seed:bas', title: 'BAS Q1', dueOn: '2026-11-28', periodEnd: '2026-09-30' },
  });
  basQ1 = ((await ok(eng, 201, 'create engagement')) as { engagement: { id: string } }).engagement.id;
  await addTime(cookieA, { clientId: harbour, workDate: '2026-10-05', minutes: 90, engagementId: basQ1 });
  await issue(cookieA, await draft(cookieA, harbour));

  await addTime(cookieA, { clientId: bay, workDate: '2026-10-06', minutes: 60 });
  bayDraft = await draft(cookieA, bay);

  const b = await signUp();
  cookieB = (await createFirm(b.cookie, 'Profit Firm B')).cookie;
  await setupFirm(cookieB, 'Profit Firm B Pty Ltd', 6000);
  bFirmClient = await makeClient(cookieB, 'Firm B Client Pty Ltd');
  await patch(`/api/clients/${bFirmClient}/pricing`, cookieB, { model: 'hourly', currency: 'AUD' });
  await addTime(cookieB, { clientId: bFirmClient, workDate: '2026-10-07', minutes: 30 });
  await issue(cookieB, await draft(cookieB, bFirmClient));

  const c = await signUp();
  cookieC = (await createFirm(c.cookie, 'Profit Firm C')).cookie;
  await setupFirm(cookieC, 'Profit Firm C Pty Ltd', null);
  cove = await makeClient(cookieC, 'Cove Co Pty Ltd');
  await patch(`/api/clients/${cove}/pricing`, cookieC, { model: 'hourly', currency: 'AUD' });
  await addTime(cookieC, { clientId: cove, workDate: '2026-10-08', minutes: 60 });
  await issue(cookieC, await draft(cookieC, cove));
}, 120_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('profitability', () => {
  it('PFS1 members get 403', async () => {
    const r = await report(memberCookie, october);
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'Only firm owners and admins can see profitability' });
  });

  it('PFS2 bad filters', async () => {
    for (const q of [
      '?from=2026-13-01&to=2026-10-31',
      '?from=2026-10-31&to=2026-10-01',
      '?from=2026-10-01&to=2026-10-31&currency=USD',
    ]) {
      const r = await report(cookieA, `/api/profitability${q}`);
      expect(r.status).toBe(400);
      expect(r.json).toEqual({ error: 'Invalid filter' });
    }
  });

  it('PFS3 issued time, before tax, with its engagement', async () => {
    const r = await report(cookieA, october);
    expect(r.status).toBe(200);
    expect(r.json.report.currency).toBe('AUD');
    expect(r.json.report.from).toBe('2026-10-01');
    expect(r.json.report.to).toBe('2026-10-31');
    expect(r.json.report.entities).toHaveLength(1);
    expect(r.json.report.entities[0]).toEqual({
      clientId: harbour,
      clientName: 'Harbour Lane Pty Ltd',
      invoiceCount: 1,
      billedCents: 22500,
      minutes: 90,
      costCents: 9000,
      standardCents: 22500,
      realisationBp: 10000,
      marginBp: 6000,
      missingCostMinutes: 0,
      missingRateMinutes: 0,
      engagements: [
        {
          engagementId: basQ1,
          title: 'BAS Q1',
          billedCents: 22500,
          minutes: 90,
          costCents: 9000,
          standardCents: 22500,
          realisationBp: 10000,
          marginBp: 6000,
          missingCostMinutes: 0,
          missingRateMinutes: 0,
        },
      ],
    });
  });

  it('PFS4 the period is the issued date', async () => {
    const r = await report(cookieA, '/api/profitability?from=2026-11-01&to=2026-11-30');
    expect(r.status).toBe(200);
    expect(r.json.report.entities).toEqual([]);
  });

  it('PFS5 drafts and void invoices are left out', async () => {
    const has = (j: { report: { entities: EntityProfit[] } }) => j.report.entities.some((e) => e.clientId === bay);
    expect(has((await report(cookieA, october)).json)).toBe(false);
    await issue(cookieA, bayDraft);
    await ok(
      await call('POST', `/api/invoices/${bayDraft}/void`, { cookie: cookieA, body: { reason: 'Test' } }),
      200,
      'void',
    );
    expect(has((await report(cookieA, october)).json)).toBe(false);
  });

  it('PFS6 currency', async () => {
    const r = await report(cookieA, `${october}&currency=GBP`);
    expect(r.status).toBe(200);
    expect(r.json.report.currency).toBe('GBP');
    expect(r.json.report.entities).toEqual([]);
  });

  it("PFS7 another firm's invoices never appear", async () => {
    const r = await report(cookieB, october);
    expect(r.status).toBe(200);
    const rows = r.json.report.entities as EntityProfit[];
    expect(rows.some((e) => e.clientId === harbour || e.clientId === bay)).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clientId).toBe(bFirmClient);
  });

  it('PFS8 no cost rate shows n/a', async () => {
    const r = await report(cookieC, october);
    expect(r.status).toBe(200);
    const row = (r.json.report.entities as EntityProfit[]).find((e) => e.clientId === cove);
    expect(row).toMatchObject({
      billedCents: 15000,
      minutes: 60,
      costCents: null,
      standardCents: 15000,
      realisationBp: 10000,
      marginBp: null,
      missingCostMinutes: 60,
    });
  });
});
