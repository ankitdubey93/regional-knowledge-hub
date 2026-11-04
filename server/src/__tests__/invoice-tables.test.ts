import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import factsJson from '@chub/shared/seed/facts.json';
import { factsSchema } from '@chub/shared/data/schemas';
import { pool } from '../db/client';
import { invoice, invoiceLine, timeEntry } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { seedFacts } from '../kb/seedFacts';
import type { InvoiceView } from '../types/invoices';
import type { TimeEntryView } from '../types/time';
import { call, createFirm, signUp } from './helpers';
import { startApp, stopApp } from './server';
import { testEnv } from './testEnv';

const all = factsSchema.parse(factsJson);
const period = { from: '2026-10-01', to: '2026-10-31' };

let cookieE = '';
let cookieF = '';
let orgE = '';
let orgF = '';
const e: string[] = []; // e[1]..e[7]
let eFixed = '';
let eEng = '';
let f1 = '';
let e3Invoice = '';
let eFixedInvoice = '';

async function failure(p: Promise<unknown>): Promise<string> {
  const err: unknown = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(err).toBeInstanceOf(Error);
  const cause = (err as Error).cause;
  return cause instanceof Error ? cause.message : (err as Error).message;
}

async function ok(method: string, path: string, cookie: string, body?: unknown, status = 200): Promise<Response> {
  const res = await call(method, path, { cookie, body });
  if (res.status !== status) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  return res;
}

async function makeClient(cookie: string, name: string): Promise<string> {
  const res = await ok(
    'POST',
    '/api/clients',
    cookie,
    { name, jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6, taxRegistered: true, taxPeriod: 'quarterly' },
    201,
  );
  return ((await res.json()) as { client: { id: string } }).client.id;
}

async function draft(cookie: string, clientId: string, engagementId: string | null = null): Promise<InvoiceView> {
  const res = await ok('POST', '/api/invoices', cookie, { clientId, ...period, engagementId }, 201);
  return ((await res.json()) as { invoice: InvoiceView }).invoice;
}

async function issue(cookie: string, id: string): Promise<Response> {
  return call('POST', `/api/invoices/${id}/issue`, { cookie, body: { issuedOn: '2026-11-02' } });
}

async function entryOf(cookie: string, clientId: string): Promise<TimeEntryView> {
  const res = await ok('GET', `/api/time?clientId=${clientId}`, cookie);
  return ((await res.json()) as { entries: TimeEntryView[] }).entries[0]!;
}

async function setupFirm(name: string): Promise<{ cookie: string; orgId: string }> {
  const u = await signUp();
  const firm = await createFirm(u.cookie, name);
  await ok('PATCH', '/api/billing/settings', firm.cookie, {
    jurisdiction: 'AU',
    legalName: `${name} Pty Ltd`,
    address: '1 George St\nSydney NSW 2000',
    taxRegistered: true,
    taxNumber: '12 345 678 901',
  });
  return firm;
}

beforeAll(async () => {
  await startApp();
  const today = new Date().toISOString().slice(0, 10);
  await seedFacts({ 'au.gst.rate': all['au.gst.rate']!, 'uk.vat.standardRate': all['uk.vat.standardRate']! }, today);

  const fe = await setupFirm('Tables Firm E');
  cookieE = fe.cookie;
  orgE = fe.orgId;
  await ok('PATCH', '/api/billing/rates', cookieE, { userId: null, currency: 'AUD', centsPerHour: 15000 });
  for (let i = 1; i <= 7; i++) {
    const id = await makeClient(cookieE, `E${i} Co`);
    e[i] = id;
    await ok('PATCH', `/api/clients/${id}/pricing`, cookieE, { model: 'hourly', currency: 'AUD' });
    await ok('POST', '/api/time', cookieE, { clientId: id, workDate: '2026-10-05', minutes: 60 }, 201);
  }
  eFixed = await makeClient(cookieE, 'E Fixed Co');
  await ok('PATCH', `/api/clients/${eFixed}/pricing`, cookieE, { model: 'fixed', currency: 'AUD', fixedCents: 110000 });
  const eng = await ok(
    'POST',
    `/api/clients/${eFixed}/engagements`,
    cookieE,
    { templateId: 'seed:bas', title: 'Fixed job', dueOn: '2026-11-28', periodEnd: '2026-09-30' },
    201,
  );
  eEng = ((await eng.json()) as { engagement: { id: string } }).engagement.id;
  await ok('POST', '/api/time', cookieE, { clientId: eFixed, workDate: '2026-10-05', minutes: 60, engagementId: eEng }, 201);

  const ff = await setupFirm('Tables Firm F');
  cookieF = ff.cookie;
  orgF = ff.orgId;
  await ok('PATCH', '/api/billing/rates', cookieF, { userId: null, currency: 'AUD', centsPerHour: 15000 });
  f1 = await makeClient(cookieF, 'F1 Co');
  await ok('PATCH', `/api/clients/${f1}/pricing`, cookieF, { model: 'hourly', currency: 'AUD' });
  await ok('POST', '/api/time', cookieF, { clientId: f1, workDate: '2026-10-05', minutes: 60 }, 201);
  await draft(cookieF, f1);
}, 120_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('invoice tables', () => {
  it('II1 the bare pool sees no rows', async () => {
    for (const t of ['invoice', 'invoice_line', 'invoice_counter']) {
      const r = await pool.query(`select count(*)::int as n from ${t}`);
      expect((r.rows[0] as { n: number }).n).toBe(0);
    }
  });

  it("II2 withOrg(F) sees none of firm E's rows", async () => {
    // Firm E has no invoice yet at this point, so create one first.
    const d = await draft(cookieE, e[1]!);
    expect(d.lines.length).toBeGreaterThan(0);
    const inv = await withOrg(orgF, (tx) => tx.select({ id: invoice.id }).from(invoice).where(eq(invoice.orgId, orgE)));
    const lines = await withOrg(orgF, (tx) => tx.select({ id: invoiceLine.id }).from(invoiceLine).where(eq(invoiceLine.orgId, orgE)));
    expect(inv).toHaveLength(0);
    expect(lines).toHaveLength(0);
    const ownInv = await withOrg(orgE, (tx) => tx.select({ id: invoice.id }).from(invoice).where(eq(invoice.orgId, orgE)));
    const ownLines = await withOrg(orgE, (tx) => tx.select({ id: invoiceLine.id }).from(invoiceLine).where(eq(invoiceLine.orgId, orgE)));
    expect(ownInv.length).toBeGreaterThan(0);
    expect(ownLines.length).toBeGreaterThan(0);
  });

  it("II3 inserting with another firm's org_id fails", async () => {
    const msg = await failure(
      withOrg(orgE, (tx) =>
        tx.insert(invoice).values({
          orgId: orgF,
          clientId: e[1]!,
          currency: 'AUD',
          taxScheme: 'none',
          periodFrom: '2026-10-01',
          periodTo: '2026-10-31',
          createdBy: 'x',
        }),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it("II4 an invoice for another firm's client fails", async () => {
    const msg = await failure(
      withOrg(orgE, (tx) =>
        tx.insert(invoice).values({
          orgId: orgE,
          clientId: f1,
          currency: 'AUD',
          taxScheme: 'none',
          periodFrom: '2026-10-01',
          periodTo: '2026-10-31',
          createdBy: 'x',
        }),
      ),
    );
    expect(msg).toMatch(/invoice_client_org_fk/);
  });

  it("II5 time cannot sit on another entity's invoice", async () => {
    // e1's draft exists from II2.
    const e1Draft = (await withOrg(orgE, (tx) => tx.select({ id: invoice.id }).from(invoice).where(eq(invoice.clientId, e[1]!))))[0]!;
    const e2Entry = await entryOf(cookieE, e[2]!);
    const msg = await failure(
      withOrg(orgE, (tx) => tx.update(timeEntry).set({ invoiceId: e1Draft.id }).where(eq(timeEntry.id, e2Entry.id))),
    );
    expect(msg).toMatch(/time_entry_invoice_fk/);
  });

  it('II6 the issued-invoice trigger', async () => {
    const d = await draft(cookieE, e[3]!);
    e3Invoice = d.id;
    expect((await issue(cookieE, d.id)).status).toBe(200);
    expect(
      await failure(withOrg(orgE, (tx) => tx.update(invoice).set({ notes: 'x' }).where(eq(invoice.id, d.id)))),
    ).toMatch(/cannot be changed/);
    expect(
      await failure(
        withOrg(orgE, (tx) => tx.update(invoice).set({ status: 'draft', number: null }).where(eq(invoice.id, d.id))),
      ),
    ).toMatch(/cannot be changed/);
    const voided = await call('POST', `/api/invoices/${d.id}/void`, { cookie: cookieE, body: { reason: 'Test' } });
    expect(voided.status).toBe(200);
  });

  it('II7 the line trigger', async () => {
    const lines = await withOrg(orgE, (tx) => tx.select({ id: invoiceLine.id }).from(invoiceLine).where(eq(invoiceLine.invoiceId, e3Invoice)));
    expect(lines.length).toBeGreaterThan(0);
    expect(
      await failure(
        withOrg(orgE, (tx) =>
          tx.insert(invoiceLine).values({
            orgId: orgE,
            invoiceId: e3Invoice,
            position: 99,
            kind: 'manual',
            description: 'late',
            unitCents: 1,
            amountCents: 1,
            taxTreatment: 'outside',
          }),
        ),
      ),
    ).toMatch(/its lines cannot be changed/);
    expect(
      await failure(
        withOrg(orgE, (tx) => tx.update(invoiceLine).set({ amountCents: 2 }).where(eq(invoiceLine.id, lines[0]!.id))),
      ),
    ).toMatch(/its lines cannot be changed/);
  });

  it('II8 the time-entry trigger', async () => {
    await draft(cookieE, e[4]!);
    const entry = await entryOf(cookieE, e[4]!);
    expect(
      await failure(withOrg(orgE, (tx) => tx.update(timeEntry).set({ minutes: 61 }).where(eq(timeEntry.id, entry.id)))),
    ).toMatch(/is on an invoice and cannot be changed/);
    await withOrg(orgE, (tx) => tx.update(timeEntry).set({ invoiceId: null }).where(eq(timeEntry.id, entry.id)));
    const after = await entryOf(cookieE, e[4]!);
    expect(after.invoiceId).toBeNull();
  });

  it('II9 the checks', async () => {
    const base = {
      orgId: orgE,
      clientId: e[1]!,
      currency: 'AUD' as const,
      taxScheme: 'none' as const,
      periodFrom: '2026-10-01',
      periodTo: '2026-10-31',
      createdBy: 'x',
    };
    expect(await failure(withOrg(orgE, (tx) => tx.insert(invoice).values({ ...base, number: 5 })))).toMatch(
      /invoice_number_check/,
    );
    expect(
      await failure(
        withOrg(orgE, (tx) => tx.insert(invoice).values({ ...base, subtotalCents: 100, taxCents: 10, totalCents: 100 })),
      ),
    ).toMatch(/invoice_amounts_check/);
  });

  it('II10 numbers are gapless under concurrency', async () => {
    const d5 = await draft(cookieE, e[5]!);
    const d6 = await draft(cookieE, e[6]!);
    const d7 = await draft(cookieE, e[7]!);
    const dFixed = await draft(cookieE, eFixed, eEng);
    eFixedInvoice = dFixed.id;
    // e2 has no draft yet (II5's update failed); make one and empty it.
    const d2 = await draft(cookieE, e[2]!);
    const emptied = await ok('DELETE', `/api/invoices/${d2.id}/lines/${d2.lines[0]!.id}`, cookieE);
    expect(((await emptied.json()) as { invoice: InvoiceView }).invoice.lines).toHaveLength(0);

    const results = await Promise.all([d5.id, d6.id, d7.id, dFixed.id, d2.id].map((id) => issue(cookieE, id)));
    const bodies = await Promise.all(results.map((r) => r.json() as Promise<{ invoice?: InvoiceView; error?: string }>));
    expect(results[4]!.status).toBe(409);
    expect(bodies[4]).toEqual({ error: 'Add at least one line first' });
    for (let i = 0; i < 4; i++) expect(results[i]!.status).toBe(200);
    const numbers = bodies
      .slice(0, 4)
      .map((b) => b.invoice!.number!)
      .sort((a, b) => a - b);
    expect(numbers).toEqual([2, 3, 4, 5]);
    const counter = await withOrg(orgE, (tx) =>
      tx.execute(sql`select next_number from invoice_counter where org_id = ${orgE}`),
    );
    expect((counter.rows[0] as { next_number: number }).next_number).toBe(6);
  });

  it('II11 the counter cannot be deleted', async () => {
    const msg = await failure(
      withOrg(orgE, (tx) => tx.execute(sql`delete from invoice_counter where org_id = ${orgE}`)),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it('II12 deleting an engagement keeps an issued fixed-fee invoice', async () => {
    const del = await call('DELETE', `/api/engagements/${eEng}`, { cookie: cookieE });
    expect(del.status).toBe(204);
    const res = await ok('GET', `/api/invoices/${eFixedInvoice}`, cookieE);
    const i = ((await res.json()) as { invoice: InvoiceView }).invoice;
    expect(i.status).toBe('issued');
    expect(i.engagementId).toBeNull();
  });

  it('II13 deleting a workspace with an issued invoice succeeds', async () => {
    const admin = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
    try {
      await admin.query('delete from organization where id = $1', [orgE]);
      const inv = await admin.query('select count(*)::int as n from invoice where org_id = $1', [orgE]);
      expect((inv.rows[0] as { n: number }).n).toBe(0);
      const te = await admin.query('select count(*)::int as n from time_entry where org_id = $1', [orgE]);
      expect((te.rows[0] as { n: number }).n).toBe(0);
    } finally {
      await admin.end();
    }
  });
});
