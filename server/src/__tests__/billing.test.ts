import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth } from '../auth';
import { pool } from '../db/client';
import { clientPricing, rateCard } from '../db/schema';
import { organization } from '../db/auth-schema';
import { withOrg } from '../db/withOrg';
import { call, createFirm, mergeCookies, signUp } from './helpers';
import { startApp, stopApp } from './server';

let cookieA = '';
let cookieB = '';
let cookieC = '';
let memberCookie = '';
let orgA = '';
let orgB = '';
let userB = '';
let memberUserId = '';
let clientA = '';
let clientA2 = '';
let clientB = '';

async function failure(p: Promise<unknown>): Promise<string> {
  const err: unknown = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const cause = (err as Error).cause;
  return cause instanceof Error ? cause.message : (err as Error).message;
}

async function makeClient(cookie: string, name: string): Promise<string> {
  const c = await call('POST', '/api/clients', {
    cookie,
    body: { name, jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6, taxRegistered: true, taxPeriod: 'quarterly' },
  });
  if (c.status !== 201) throw new Error(`create client failed: ${c.status}`);
  return ((await c.json()) as { client: { id: string } }).client.id;
}

beforeAll(async () => {
  await startApp();
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Billing Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;
  const b = await signUp();
  const firmB = await createFirm(b.cookie, 'Billing Firm B');
  cookieB = firmB.cookie;
  orgB = firmB.orgId;
  userB = b.userId;
  const c = await signUp();
  cookieC = (await createFirm(c.cookie, 'Billing Firm C')).cookie;

  const m = await signUp();
  memberUserId = m.userId;
  await auth.api.addMember({ body: { userId: m.userId, organizationId: firmA.orgId, role: 'member' } });
  const active = await call('POST', '/api/auth/organization/set-active', {
    cookie: m.cookie,
    body: { organizationId: firmA.orgId },
  });
  if (active.status !== 200) throw new Error(`member set-active failed: ${active.status}`);
  memberCookie = mergeCookies(m.cookie, active);

  clientA = await makeClient(cookieA, 'Billing Co');
  clientA2 = await makeClient(cookieA, 'Billing Co 2');
  clientB = await makeClient(cookieB, 'B Billing Co');
}, 90_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('billing', () => {
  it('BL1 a new firm reads empty settings', async () => {
    const res = await call('GET', '/api/billing/settings', { cookie: cookieC });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      settings: {
        jurisdiction: null,
        legalName: null,
        address: null,
        taxRegistered: false,
        taxNumber: null,
        paymentDays: 14,
        paymentDetails: '',
        accountCode: '200',
        scheme: null,
        homeCurrency: null,
      },
      canEdit: true,
    });
  });

  it('BL2 an owner saves AU details', async () => {
    const res = await call('PATCH', '/api/billing/settings', {
      cookie: cookieA,
      body: {
        jurisdiction: 'AU',
        legalName: 'Ledger Lane Pty Ltd',
        address: '1 George St\nSydney NSW 2000',
        taxRegistered: true,
        taxNumber: '12 345 678 901',
      },
    });
    expect(res.status).toBe(200);
    const { settings } = (await res.json()) as { settings: { taxNumber: string; scheme: string; homeCurrency: string } };
    expect(settings.taxNumber).toBe('12345678901');
    expect(settings.scheme).toBe('au_gst');
    expect(settings.homeCurrency).toBe('AUD');
  });

  it('BL3 a bad ABN', async () => {
    const res = await call('PATCH', '/api/billing/settings', { cookie: cookieA, body: { taxNumber: '123' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Enter an 11-digit ABN' });
  });

  it('BL4 registered needs a number', async () => {
    const noCountry = await call('PATCH', '/api/billing/settings', { cookie: cookieC, body: { taxRegistered: true } });
    expect(noCountry.status).toBe(400);
    expect(await noCountry.json()).toEqual({ error: 'Choose your country before turning on tax registration' });
    const noNumber = await call('PATCH', '/api/billing/settings', {
      cookie: cookieC,
      body: { jurisdiction: 'AU', taxRegistered: true },
    });
    expect(noNumber.status).toBe(400);
    expect(await noNumber.json()).toEqual({ error: 'Enter your ABN or VAT number' });
  });

  it('BL5 a member reads but cannot change', async () => {
    const get = await call('GET', '/api/billing/settings', { cookie: memberCookie });
    expect(get.status).toBe(200);
    expect(((await get.json()) as { canEdit: boolean }).canEdit).toBe(false);
    const patch = await call('PATCH', '/api/billing/settings', { cookie: memberCookie, body: { paymentDays: 30 } });
    expect(patch.status).toBe(403);
    expect(await patch.json()).toEqual({ error: 'Only firm owners and admins can change billing' });
    const rates = await call('PATCH', '/api/billing/rates', {
      cookie: memberCookie,
      body: { userId: null, currency: 'AUD', centsPerHour: 100 },
    });
    expect(rates.status).toBe(403);
    expect(await rates.json()).toEqual({ error: 'Only firm owners and admins can change billing' });
  });

  it('BL6 rates', async () => {
    const first = await call('PATCH', '/api/billing/rates', {
      cookie: cookieA,
      body: { userId: null, currency: 'AUD', centsPerHour: 15000 },
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      rates: [{ userId: null, userName: 'Firm default', currency: 'AUD', centsPerHour: 15000 }],
    });
    const second = await call('PATCH', '/api/billing/rates', {
      cookie: cookieA,
      body: { userId: memberUserId, currency: 'AUD', centsPerHour: 9000 },
    });
    expect(second.status).toBe(200);
    const { rates } = (await second.json()) as { rates: { userId: string | null }[] };
    expect(rates).toHaveLength(2);
    expect(rates[0]!.userId).toBeNull();
    const list = await call('GET', '/api/billing/rates', { cookie: cookieA });
    const body = (await list.json()) as { members: { userId: string }[] };
    expect(body.members.some((m) => m.userId === memberUserId)).toBe(true);
  });

  it('BL7 a rate for a non-member', async () => {
    const res = await call('PATCH', '/api/billing/rates', {
      cookie: cookieA,
      body: { userId: userB, currency: 'AUD', centsPerHour: 100 },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Not a member of this firm' });
  });

  it('BL8 null removes a rate', async () => {
    const res = await call('PATCH', '/api/billing/rates', {
      cookie: cookieA,
      body: { userId: memberUserId, currency: 'AUD', centsPerHour: null },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rates: unknown[] }).rates).toHaveLength(1);
  });

  it('BL9 pricing', async () => {
    const get = await call('GET', `/api/clients/${clientA}/pricing`, { cookie: cookieA });
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ pricing: null, canEdit: true });
    const set = await call('PATCH', `/api/clients/${clientA}/pricing`, {
      cookie: cookieA,
      body: { model: 'hourly', currency: 'AUD' },
    });
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({
      pricing: { clientId: clientA, model: 'hourly', currency: 'AUD', fixedCents: null, retainerCents: null },
    });
    const bad = await call('PATCH', `/api/clients/${clientA}/pricing`, {
      cookie: cookieA,
      body: { model: 'fixed', currency: 'AUD' },
    });
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { issues: { message: string }[] };
    expect(body.issues[0]!.message).toBe('Enter the fixed fee');
  });

  it("BL10 another firm's client", async () => {
    const get = await call('GET', `/api/clients/${clientB}/pricing`, { cookie: cookieA });
    expect(get.status).toBe(404);
    expect(await get.json()).toEqual({ error: 'Client not found' });
    const patch = await call('PATCH', `/api/clients/${clientB}/pricing`, {
      cookie: cookieA,
      body: { model: 'hourly', currency: 'AUD' },
    });
    expect(patch.status).toBe(404);
    expect(await patch.json()).toEqual({ error: 'Client not found' });
    const bad = await call('GET', '/api/clients/not-a-uuid/pricing', { cookie: cookieA });
    expect(bad.status).toBe(404);
  });
});

describe('billing isolation', () => {
  it('BI1 the bare pool sees no rows', async () => {
    for (const table of ['rate_card', 'client_pricing']) {
      const r = await pool.query(`select count(*)::int as n from ${table}`);
      expect((r.rows[0] as { n: number }).n).toBe(0);
    }
  });

  it("BI2 withOrg(orgB) sees none of firm A's rows", async () => {
    const rates = await withOrg(orgB, (tx) => tx.select({ id: rateCard.id }).from(rateCard).where(eq(rateCard.orgId, orgA)));
    expect(rates).toHaveLength(0);
    const pricing = await withOrg(orgB, (tx) =>
      tx.select({ id: clientPricing.clientId }).from(clientPricing).where(eq(clientPricing.orgId, orgA)),
    );
    expect(pricing).toHaveLength(0);
    const ownRates = await withOrg(orgA, (tx) => tx.select({ id: rateCard.id }).from(rateCard).where(eq(rateCard.orgId, orgA)));
    expect(ownRates.length).toBeGreaterThan(0);
    const ownPricing = await withOrg(orgA, (tx) =>
      tx.select({ id: clientPricing.clientId }).from(clientPricing).where(eq(clientPricing.orgId, orgA)),
    );
    expect(ownPricing.length).toBeGreaterThan(0);
  });

  it("BI3 inserting with another firm's org_id fails", async () => {
    const msg = await failure(
      withOrg(orgA, (tx) => tx.insert(rateCard).values({ orgId: orgB, userId: null, currency: 'GBP', centsPerHour: 1 })),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it("BI4 pricing cannot point at another firm's client", async () => {
    const msg = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(clientPricing).values({ clientId: clientB, orgId: orgA, model: 'hourly', currency: 'AUD' }),
      ),
    );
    expect(msg).toMatch(/client_pricing_client_org_fk/);
  });

  it('BI5 the checks', async () => {
    expect(
      await failure(
        withOrg(orgA, (tx) => tx.insert(rateCard).values({ orgId: orgA, userId: 'bi5', currency: 'AUD', centsPerHour: 1_000_001 })),
      ),
    ).toMatch(/rate_card_cents_check/);
    expect(
      await failure(
        withOrg(orgA, (tx) =>
          tx.insert(clientPricing).values({ clientId: clientA2, orgId: orgA, model: 'fixed', currency: 'AUD', fixedCents: null }),
        ),
      ),
    ).toMatch(/client_pricing_amounts_check/);
    expect(
      await failure(withOrg(orgA, (tx) => tx.update(organization).set({ billingPaymentDays: 121 }).where(eq(organization.id, orgA)))),
    ).toMatch(/organization_billing_check/);
  });

  it('BI6 one firm default per currency', async () => {
    const msg = await failure(
      withOrg(orgA, async (tx) => {
        const row = { orgId: orgA, userId: null, currency: 'GBP' as const, centsPerHour: 1 };
        await tx.insert(rateCard).values(row);
        await tx.insert(rateCard).values(row);
      }),
    );
    expect(msg).toMatch(/rate_card_who_currency_idx/);
  });
});
