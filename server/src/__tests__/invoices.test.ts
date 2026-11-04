import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import factsJson from '@chub/shared/seed/facts.json';
import { factsSchema } from '@chub/shared/data/schemas';
import { XERO_INVOICE_COLUMNS } from '@chub/shared/utils/invoiceCsv';
import { auth } from '../auth';
import { pool } from '../db/client';
import { seedFacts } from '../kb/seedFacts';
import type { InvoiceSummary, InvoiceView } from '../types/invoices';
import type { TimeEntryView } from '../types/time';
import { call, createFirm, mergeCookies, signUp } from './helpers';
import { startApp, stopApp } from './server';

const all = factsSchema.parse(factsJson);

let cookieA = '';
let memberCookie = '';
let cookieB = '';
let cookieC = '';
let cookieD = '';
let ownerAName = '';
let memberName = '';
let ownerCName = '';
let harbour = '';
let fixedCo = '';
let retainerCo = '';
let london = '';
let bare = '';
let fixedEng = '';
let thames = '';
let small = '';
let pound = '';
let dClient = '';

let inv1 = '';
let fixedInv = '';
let londonInv = '';
let line3Id = '';
let line1Id = '';
let line2Id = '';

const period = { from: '2026-10-01', to: '2026-10-31' };

async function makeClient(cookie: string, name: string, jurisdiction: 'AU' | 'UK' = 'AU'): Promise<string> {
  const body =
    jurisdiction === 'AU'
      ? { name, jurisdiction, entityType: 'company', fyEndMonth: 6, taxRegistered: true, taxPeriod: 'quarterly' }
      : { name, jurisdiction, entityType: 'company', fyEndMonth: 3, taxRegistered: true, taxPeriod: 'quarterly' };
  const c = await call('POST', '/api/clients', { cookie, body });
  if (c.status !== 201) throw new Error(`create client failed: ${c.status} ${await c.text()}`);
  return ((await c.json()) as { client: { id: string } }).client.id;
}

async function patchOk(path: string, cookie: string, body: unknown): Promise<void> {
  const res = await call('PATCH', path, { cookie, body });
  if (res.status !== 200) throw new Error(`PATCH ${path} failed: ${res.status} ${await res.text()}`);
}

async function setSettings(cookie: string, body: unknown): Promise<void> {
  await patchOk('/api/billing/settings', cookie, body);
}

async function setRate(cookie: string, currency: 'AUD' | 'GBP', centsPerHour: number): Promise<void> {
  await patchOk('/api/billing/rates', cookie, { userId: null, currency, centsPerHour });
}

async function setPricing(cookie: string, clientId: string, body: unknown): Promise<void> {
  await patchOk(`/api/clients/${clientId}/pricing`, cookie, body);
}

async function addTime(cookie: string, body: Record<string, unknown>): Promise<TimeEntryView> {
  const res = await call('POST', '/api/time', { cookie, body });
  if (res.status !== 201) throw new Error(`add time failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { entry: TimeEntryView }).entry;
}

async function listTime(cookie: string, clientId: string): Promise<TimeEntryView[]> {
  const res = await call('GET', `/api/time?clientId=${clientId}`, { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as { entries: TimeEntryView[] }).entries;
}

async function create(cookie: string, clientId: string, extra: Record<string, unknown> = {}) {
  const res = await call('POST', '/api/invoices', { cookie, body: { clientId, ...period, ...extra } });
  return { status: res.status, json: (await res.json()) as { invoice: InvoiceView; error?: string } };
}

async function inv(res: Response): Promise<InvoiceView> {
  return ((await res.json()) as { invoice: InvoiceView }).invoice;
}

async function entryFor(cookie: string, clientId: string, minutes: number, date: string): Promise<TimeEntryView> {
  const e = (await listTime(cookie, clientId)).find((x) => x.minutes === minutes && x.workDate === date);
  if (!e) throw new Error('entry not found');
  return e;
}

beforeAll(async () => {
  await startApp();
  const today = new Date().toISOString().slice(0, 10);
  await seedFacts({ 'au.gst.rate': all['au.gst.rate']!, 'uk.vat.standardRate': all['uk.vat.standardRate']! }, today);

  // Firm A: AU registered, owner and a member.
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Invoice Firm A');
  cookieA = firmA.cookie;
  const m = await signUp();
  await auth.api.addMember({ body: { userId: m.userId, organizationId: firmA.orgId, role: 'member' } });
  const active = await call('POST', '/api/auth/organization/set-active', {
    cookie: m.cookie,
    body: { organizationId: firmA.orgId },
  });
  if (active.status !== 200) throw new Error(`member set-active failed: ${active.status}`);
  memberCookie = mergeCookies(m.cookie, active);
  await setSettings(cookieA, {
    jurisdiction: 'AU',
    legalName: 'Ledger Lane Pty Ltd',
    address: '1 George St\nSydney NSW 2000',
    taxRegistered: true,
    taxNumber: '12 345 678 901',
  });
  await setRate(cookieA, 'AUD', 15000);
  await setRate(cookieA, 'GBP', 8000);

  harbour = await makeClient(cookieA, 'Harbour Co');
  fixedCo = await makeClient(cookieA, 'Fixed Co');
  retainerCo = await makeClient(cookieA, 'Retainer Co');
  london = await makeClient(cookieA, 'London Co', 'UK');
  bare = await makeClient(cookieA, 'Bare Co');
  await setPricing(cookieA, harbour, { model: 'hourly', currency: 'AUD' });
  await setPricing(cookieA, fixedCo, { model: 'fixed', currency: 'AUD', fixedCents: 110000 });
  await setPricing(cookieA, retainerCo, { model: 'retainer', currency: 'AUD', retainerCents: 50000 });
  await setPricing(cookieA, london, { model: 'hourly', currency: 'GBP' });
  const eng = await call('POST', `/api/clients/${fixedCo}/engagements`, {
    cookie: cookieA,
    body: { templateId: 'seed:bas', title: 'Year end 2026', dueOn: '2026-11-28', periodEnd: '2026-09-30' },
  });
  if (eng.status !== 201) throw new Error(`create engagement failed: ${eng.status}`);
  fixedEng = ((await eng.json()) as { engagement: { id: string } }).engagement.id;

  // Firm B: UK registered.
  const b = await signUp();
  cookieB = (await createFirm(b.cookie, 'Invoice Firm B')).cookie;
  await setSettings(cookieB, {
    jurisdiction: 'UK',
    legalName: 'Thames Books Ltd',
    address: '2 Strand\nLondon',
    taxRegistered: true,
    taxNumber: 'GB123456789',
  });
  await setRate(cookieB, 'GBP', 12000);
  thames = await makeClient(cookieB, 'Thames Ltd', 'UK');
  await setPricing(cookieB, thames, { model: 'hourly', currency: 'GBP' });

  // Firm C: AU, not registered.
  const c = await signUp();
  cookieC = (await createFirm(c.cookie, 'Invoice Firm C')).cookie;
  await setSettings(cookieC, { jurisdiction: 'AU', legalName: 'Small Books', address: '3 Main St\nHobart' });
  await setRate(cookieC, 'AUD', 10000);
  small = await makeClient(cookieC, 'Small Co');
  pound = await makeClient(cookieC, 'Pound Co');
  await setPricing(cookieC, small, { model: 'hourly', currency: 'AUD' });
  await setPricing(cookieC, pound, { model: 'hourly', currency: 'GBP' });

  // Firm D: no settings.
  const d = await signUp();
  cookieD = (await createFirm(d.cookie, 'Invoice Firm D')).cookie;
  dClient = await makeClient(cookieD, 'D Co');
  await setPricing(cookieD, dClient, { model: 'hourly', currency: 'AUD' });

  // Time.
  const e1 = await addTime(cookieA, { clientId: harbour, workDate: '2026-10-05', minutes: 90, note: 'Bank rec' });
  ownerAName = e1.userName;
  await addTime(cookieA, { clientId: harbour, workDate: '2026-10-06', minutes: 20 });
  await addTime(cookieA, { clientId: harbour, workDate: '2026-10-07', minutes: 30, billable: false });
  await addTime(cookieA, { clientId: harbour, workDate: '2026-11-03', minutes: 60 });
  const em = await addTime(memberCookie, { clientId: harbour, workDate: '2026-10-08', minutes: 45, note: 'Payroll' });
  memberName = em.userName;
  await addTime(cookieA, { clientId: fixedCo, workDate: '2026-10-10', minutes: 30, engagementId: fixedEng });
  await addTime(cookieA, { clientId: london, workDate: '2026-10-12', minutes: 60 });
  await addTime(cookieB, { clientId: thames, workDate: '2026-10-14', minutes: 30 });
  const es = await addTime(cookieC, { clientId: small, workDate: '2026-10-15', minutes: 60 });
  ownerCName = es.userName;
  await addTime(cookieC, { clientId: pound, workDate: '2026-10-15', minutes: 30 });
  await addTime(cookieD, { clientId: dClient, workDate: '2026-10-15', minutes: 15 });
}, 120_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('invoices', () => {
  it('IV1 an hourly draft from unbilled time', async () => {
    const r = await create(cookieA, harbour);
    expect(r.status).toBe(201);
    const i = r.json.invoice;
    expect(i.status).toBe('draft');
    expect(i.number).toBeNull();
    expect(i.displayNumber).toBeNull();
    expect(i.currency).toBe('AUD');
    expect(i.taxScheme).toBe('au_gst');
    expect(i.taxRateBp).toBe(1000);
    expect(i.lines.map((l) => l.amountCents)).toEqual([22500, 5000, 11250]);
    expect(i.lines.map((l) => l.taxCents)).toEqual([2250, 500, 1125]);
    expect(i.lines.every((l) => l.kind === 'time')).toBe(true);
    expect(i.subtotalCents).toBe(38750);
    expect(i.taxCents).toBe(3875);
    expect(i.totalCents).toBe(42625);
    expect(i.noTaxSubtotalCents).toBe(0);
    expect(i.lines[0]!.description).toBe(`Bank rec (${ownerAName}, 5 October 2026)`);
    expect(i.lines[1]!.description).toBe(`Professional services (${ownerAName}, 6 October 2026)`);
    expect(i.lines[2]!.description).toBe(`Payroll (${memberName}, 8 October 2026)`);
    inv1 = i.id;
    line1Id = i.lines[0]!.id;
    line2Id = i.lines[1]!.id;
    line3Id = i.lines[2]!.id;
  });

  it('IV2 billed time is locked', async () => {
    const entries = await listTime(cookieA, harbour);
    for (const minutes of [90, 20, 45]) {
      const e = entries.find((x) => x.minutes === minutes)!;
      expect(e.invoiceId).toBe(inv1);
      expect(e.canEdit).toBe(false);
    }
    expect(entries.find((x) => x.minutes === 30)!.invoiceId).toBeNull();
    expect(entries.find((x) => x.minutes === 60)!.invoiceId).toBeNull();
    const e90 = entries.find((x) => x.minutes === 90)!;
    const patch = await call('PATCH', `/api/time/${e90.id}`, { cookie: cookieA, body: { minutes: 91 } });
    expect(patch.status).toBe(409);
    expect(await patch.json()).toEqual({ error: 'This entry is on an invoice and cannot be changed' });
  });

  it('IV3 nothing left to bill', async () => {
    const r = await create(cookieA, harbour);
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: 'There is no unbilled time in this period' });
  });

  it('IV4 a tax treatment change recalculates', async () => {
    const res = await call('PATCH', `/api/invoices/${inv1}/lines/${line2Id}`, { cookie: cookieA, body: { taxTreatment: 'zero' } });
    expect(res.status).toBe(200);
    const i = await inv(res);
    expect(i.lines[1]!.taxCents).toBe(0);
    expect(i.taxCents).toBe(3375);
    expect(i.totalCents).toBe(42125);
    expect(i.noTaxSubtotalCents).toBe(5000);
  });

  it('IV5 a treatment not available', async () => {
    const res = await call('PATCH', `/api/invoices/${inv1}/lines/${line1Id}`, { cookie: cookieA, body: { taxTreatment: 'exempt' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'That tax treatment is not available for this invoice' });
  });

  it("IV6 a time line's amount is fixed", async () => {
    const res = await call('PATCH', `/api/invoices/${inv1}/lines/${line1Id}`, { cookie: cookieA, body: { amountCents: 1 } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "A time line's amount comes from its minutes and rate" });
  });

  it('IV7 a manual line', async () => {
    const res = await call('POST', `/api/invoices/${inv1}/lines`, {
      cookie: cookieA,
      body: { description: 'Disbursement: ASIC fee', amountCents: 6700, taxTreatment: 'outside' },
    });
    expect(res.status).toBe(201);
    const i = await inv(res);
    expect(i.lines).toHaveLength(4);
    const l = i.lines[3]!;
    expect(l.position).toBe(4);
    expect(l.kind).toBe('manual');
    expect(l.taxCents).toBe(0);
    expect(i.subtotalCents).toBe(45450);
    expect(i.taxCents).toBe(3375);
    expect(i.totalCents).toBe(48825);
    expect(i.noTaxSubtotalCents).toBe(11700);
  });

  it('IV8 removing a time line releases its entry', async () => {
    const res = await call('DELETE', `/api/invoices/${inv1}/lines/${line3Id}`, { cookie: cookieA });
    expect(res.status).toBe(200);
    const i = await inv(res);
    expect(i.lines).toHaveLength(3);
    expect(i.subtotalCents).toBe(34200);
    expect(i.taxCents).toBe(2250);
    expect(i.totalCents).toBe(36450);
    expect(i.noTaxSubtotalCents).toBe(11700);
    expect((await entryFor(cookieA, harbour, 45, '2026-10-08')).invoiceId).toBeNull();
  });

  it('IV9 members cannot issue', async () => {
    const res = await call('POST', `/api/invoices/${inv1}/issue`, { cookie: memberCookie, body: { issuedOn: '2026-11-02' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Only firm owners and admins can issue invoices' });
  });

  it('IV10 issuing numbers and snapshots', async () => {
    const res = await call('POST', `/api/invoices/${inv1}/issue`, { cookie: cookieA, body: { issuedOn: '2026-11-02' } });
    expect(res.status).toBe(200);
    const i = await inv(res);
    expect(i.number).toBe(1);
    expect(i.displayNumber).toBe('INV-0001');
    expect(i.status).toBe('issued');
    expect(i.issuedOn).toBe('2026-11-02');
    expect(i.dueOn).toBe('2026-11-16');
    expect(i.seller.name).toBe('Ledger Lane Pty Ltd');
    expect(i.seller.taxNumber).toBe('12345678901');
    expect(i.seller.jurisdiction).toBe('AU');
    expect(i.buyerName).toBe('Harbour Co');
    expect(i.canEdit).toBe(false);
    expect(i.canVoid).toBe(true);
    const audit = await call('GET', '/api/audit', { cookie: cookieA });
    const events = ((await audit.json()) as { events: { action: string; targetId: string }[] }).events;
    expect(events.some((e) => e.action === 'invoice.issue' && e.targetId === inv1)).toBe(true);
  });

  it('IV11 an issued invoice is immutable', async () => {
    const patch = await call('PATCH', `/api/invoices/${inv1}`, { cookie: cookieA, body: { notes: 'x' } });
    expect(patch.status).toBe(409);
    expect(await patch.json()).toEqual({ error: 'Only a draft can be changed' });
    const line = await call('POST', `/api/invoices/${inv1}/lines`, {
      cookie: cookieA,
      body: { description: 'x', amountCents: 1, taxTreatment: 'standard' },
    });
    expect(line.status).toBe(409);
    expect(await line.json()).toEqual({ error: 'Only a draft can be changed' });
    const del = await call('DELETE', `/api/invoices/${inv1}`, { cookie: cookieA });
    expect(del.status).toBe(409);
    expect(await del.json()).toEqual({ error: 'An issued invoice cannot be deleted. Void it instead.' });
    const again = await call('POST', `/api/invoices/${inv1}/issue`, { cookie: cookieA, body: { issuedOn: '2026-11-02' } });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'Only a draft can be issued' });
  });

  it('IV12 a fixed fee', async () => {
    const missing = await create(cookieA, fixedCo, { engagementId: null });
    expect(missing.status).toBe(400);
    expect(missing.json).toEqual({ error: 'A fixed fee needs an engagement' });
    const r = await create(cookieA, fixedCo, { engagementId: fixedEng });
    expect(r.status).toBe(201);
    const i = r.json.invoice;
    expect(i.lines).toHaveLength(1);
    const l = i.lines[0]!;
    expect(l.kind).toBe('fixed');
    expect(l.description).toBe('Year end 2026');
    expect(l.amountCents).toBe(110000);
    expect(l.taxCents).toBe(11000);
    expect(i.totalCents).toBe(121000);
    expect(i.engagementTitle).toBe('Year end 2026');
    expect((await entryFor(cookieA, fixedCo, 30, '2026-10-10')).invoiceId).toBe(i.id);
    fixedInv = i.id;
  });

  it('IV13 a retainer', async () => {
    const r = await create(cookieA, retainerCo);
    expect(r.status).toBe(201);
    const l = r.json.invoice.lines[0]!;
    expect(r.json.invoice.lines).toHaveLength(1);
    expect(l.kind).toBe('retainer');
    expect(l.description).toBe('Retainer 1 October 2026 to 31 October 2026');
    expect(l.amountCents).toBe(50000);
    expect(l.taxCents).toBe(5000);
  });

  it('IV14 another currency needs an exchange rate', async () => {
    const r = await create(cookieA, london);
    expect(r.status).toBe(201);
    const i = r.json.invoice;
    expect(i.currency).toBe('GBP');
    expect(i.homeCurrency).toBe('AUD');
    expect(i.needsFx).toBe(true);
    expect(i.lines).toHaveLength(1);
    expect(i.lines[0]!.amountCents).toBe(8000);
    expect(i.lines[0]!.taxCents).toBe(800);
    expect(i.totalCents).toBe(8800);
    const early = await call('POST', `/api/invoices/${i.id}/issue`, { cookie: cookieA, body: { issuedOn: '2026-11-02' } });
    expect(early.status).toBe(409);
    expect(await early.json()).toEqual({
      error: 'Enter the exchange rate, its date and its source. The tax must also be shown in AUD.',
    });
    await patchOk(`/api/invoices/${i.id}`, cookieA, { fx: { rateMicros: 1950000, date: '2026-11-02', source: 'RBA' } });
    const issued = await call('POST', `/api/invoices/${i.id}/issue`, { cookie: cookieA, body: { issuedOn: '2026-11-02' } });
    expect(issued.status).toBe(200);
    const done = await inv(issued);
    expect(done.number).toBe(2);
    expect(done.taxHomeCents).toBe(1560);
    expect(done.totalHomeCents).toBe(17160);
    londonInv = i.id;
  });

  it('IV15 no exchange rate for the home currency', async () => {
    const res = await call('PATCH', `/api/invoices/${fixedInv}`, {
      cookie: cookieA,
      body: { fx: { rateMicros: 1000000, date: '2026-11-02', source: 'x' } },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'An exchange rate is only for an invoice in another currency' });
  });

  it("IV16 a UK VAT invoice needs the customer's address", async () => {
    const r = await create(cookieB, thames);
    expect(r.status).toBe(201);
    const i = r.json.invoice;
    expect(i.taxScheme).toBe('uk_vat');
    expect(i.taxRateBp).toBe(2000);
    expect(i.lines[0]!.amountCents).toBe(6000);
    expect(i.lines[0]!.taxCents).toBe(1200);
    const early = await call('POST', `/api/invoices/${i.id}/issue`, { cookie: cookieB, body: { issuedOn: '2026-11-02' } });
    expect(early.status).toBe(409);
    expect(await early.json()).toEqual({ error: "Add the customer's address. A UK VAT invoice must show it." });
    await patchOk(`/api/invoices/${i.id}`, cookieB, { buyerAddress: '1 Thames St\nLondon' });
    const issued = await call('POST', `/api/invoices/${i.id}/issue`, { cookie: cookieB, body: { issuedOn: '2026-11-02' } });
    expect(issued.status).toBe(200);
    expect((await inv(issued)).number).toBe(1);
  });

  it('IV17 an unregistered firm charges no tax', async () => {
    const r = await create(cookieC, small);
    expect(r.status).toBe(201);
    const i = r.json.invoice;
    expect(i.taxScheme).toBe('none');
    expect(i.taxFactKey).toBeNull();
    expect(i.taxRateBp).toBe(0);
    expect(i.allowedTreatments).toEqual(['outside']);
    expect(i.lines[0]!.taxTreatment).toBe('outside');
    expect(i.lines[0]!.taxCents).toBe(0);
    expect(i.lines[0]!.amountCents).toBe(10000);
  });

  it('IV18 no rate in the currency', async () => {
    const r = await create(cookieC, pound);
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: `No hourly rate in GBP for ${ownerCName}. Set one on the Billing page.` });
  });

  it('IV19 pricing and settings come first', async () => {
    const noPricing = await create(cookieA, bare);
    expect(noPricing.status).toBe(409);
    expect(noPricing.json).toEqual({ error: "Set this entity's pricing first" });
    const noSettings = await create(cookieD, dClient);
    expect(noSettings.status).toBe(409);
    expect(noSettings.json).toEqual({ error: 'Set up your billing details first' });
  });

  it('IV20 a draft locks the country and registration', async () => {
    const locked = await call('PATCH', '/api/billing/settings', { cookie: cookieA, body: { taxRegistered: false } });
    expect(locked.status).toBe(409);
    expect(await locked.json()).toEqual({
      error: 'Issue or delete your draft invoices before changing your tax registration or country',
    });
    const same = await call('PATCH', '/api/billing/settings', { cookie: cookieA, body: { jurisdiction: 'AU', paymentDays: 14 } });
    expect(same.status).toBe(200);
  });

  it('IV21 voiding', async () => {
    const denied = await call('POST', `/api/invoices/${inv1}/void`, { cookie: memberCookie, body: { reason: 'x' } });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: 'Only firm owners and admins can void invoices' });
    const res = await call('POST', `/api/invoices/${inv1}/void`, { cookie: cookieA, body: { reason: 'Wrong client' } });
    expect(res.status).toBe(200);
    const i = await inv(res);
    expect(i.status).toBe('void');
    expect(i.voidReason).toBe('Wrong client');
    expect(typeof i.voidedAt).toBe('string');
    expect(i.number).toBe(1);
    expect((await entryFor(cookieA, harbour, 90, '2026-10-05')).invoiceId).toBeNull();
    expect((await entryFor(cookieA, harbour, 20, '2026-10-06')).invoiceId).toBeNull();
    const again = await call('POST', `/api/invoices/${inv1}/void`, { cookie: cookieA, body: { reason: 'Again' } });
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'Only an issued invoice can be voided' });
    const audit = await call('GET', '/api/audit', { cookie: cookieA });
    const events = ((await audit.json()) as { events: { action: string; targetId: string }[] }).events;
    expect(events.some((e) => e.action === 'invoice.void' && e.targetId === inv1)).toBe(true);
  });

  it('IV22 the Xero CSV', async () => {
    const draftish = await call('GET', `/api/invoices/${inv1}/csv`, { cookie: cookieA });
    expect(draftish.status).toBe(409);
    expect(await draftish.json()).toEqual({ error: 'Only an issued invoice can be exported' });
    const res = await call('GET', `/api/invoices/${londonInv}/csv`, { cookie: cookieA });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/csv/);
    expect(res.headers.get('content-disposition')).toContain('INV-0002.csv');
    const lines = (await res.text()).split('\r\n');
    expect(lines[0]).toBe(XERO_INVOICE_COLUMNS.join(','));
    expect(lines[1]).toContain(',INV-0002,,02/11/2026,16/11/2026,');
    expect(lines[1]).toContain(',1,80.00,,200,GST on Income,8.00,');
    expect(lines[1]!.endsWith(',GBP,')).toBe(true);
  });

  it('IV23 deleting a draft releases its time', async () => {
    const del = await call('DELETE', `/api/invoices/${fixedInv}`, { cookie: cookieA });
    expect(del.status).toBe(204);
    expect((await entryFor(cookieA, fixedCo, 30, '2026-10-10')).invoiceId).toBeNull();
    const get = await call('GET', `/api/invoices/${fixedInv}`, { cookie: cookieA });
    expect(get.status).toBe(404);
    expect(await get.json()).toEqual({ error: 'Invoice not found' });
  });

  it('IV24 an entity with invoices cannot be deleted', async () => {
    const del = await call('DELETE', `/api/clients/${harbour}`, { cookie: cookieA });
    expect(del.status).toBe(409);
    expect(await del.json()).toEqual({ error: 'This entity has invoices, so it cannot be deleted' });
    const ok = await call('DELETE', `/api/clients/${bare}`, { cookie: cookieA });
    expect(ok.status).toBe(204);
  });

  it('IV25 listing', async () => {
    const res = await call('GET', '/api/invoices?status=issued', { cookie: cookieA });
    expect(res.status).toBe(200);
    const list = ((await res.json()) as { invoices: InvoiceSummary[] }).invoices;
    expect(list.some((i) => i.id === londonInv)).toBe(true);
    expect(list.some((i) => i.status === 'draft')).toBe(false);
    const bad = await call('GET', '/api/invoices?status=bad', { cookie: cookieA });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Invalid filter' });
  });

  it('IV26 another firm cannot reach an invoice', async () => {
    const notFound = { error: 'Invoice not found' };
    const base = `/api/invoices/${londonInv}`;
    const calls: [string, string, unknown?][] = [
      ['GET', base],
      ['PATCH', base, { notes: 'x' }],
      ['DELETE', base],
      ['POST', `${base}/issue`, { issuedOn: '2026-11-02' }],
      ['GET', `${base}/csv`],
    ];
    for (const [method, path, body] of calls) {
      const res = await call(method, path, { cookie: cookieB, body });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual(notFound);
    }
    const bad = await call('GET', '/api/invoices/not-a-uuid', { cookie: cookieA });
    expect(bad.status).toBe(404);
  });

  it('IV27 invalid input', async () => {
    const bad = await call('POST', '/api/invoices', {
      cookie: cookieA,
      body: { clientId: harbour, from: '2026-10-31', to: '2026-10-01' },
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe('Invalid input');
    const draft = await create(cookieA, retainerCo);
    const target = draft.status === 201 ? draft.json.invoice.id : '';
    const list = await call('GET', '/api/invoices?status=draft', { cookie: cookieA });
    const drafts = ((await list.json()) as { invoices: InvoiceSummary[] }).invoices;
    const id = target || drafts[0]!.id;
    const line = await call('POST', `/api/invoices/${id}/lines`, {
      cookie: cookieA,
      body: { description: '', amountCents: 1, taxTreatment: 'standard' },
    });
    expect(line.status).toBe(400);
  });
});
