import express, { Router } from 'express';
import { z } from 'zod';
import { requireFirm } from '../middleware/session';
import { getBillingSettings, getPricing, listRates, setPricing, setRate, updateBillingSettings } from '../services/billingService';
import { billingSettingsPatchSchema, pricingSetSchema, rateSetSchema } from '../types/billing';
import { firmOf, type FirmRole } from '../types';

// Mounted at /api/billing and /api/clients/:clientId (pricing). orgId and role come only from requireFirm (Hard rule 11).

const idSchema = z.uuid();
const canEdit = (role: FirmRole) => role === 'owner' || role === 'admin';
const FORBIDDEN = 'Only firm owners and admins can change billing';

export const billingRoutes = Router();
billingRoutes.use(express.json({ limit: '20kb' }), requireFirm);

billingRoutes.get('/settings', async (_req, res) => {
  const { orgId, role } = firmOf(res);
  res.status(200).json({ settings: await getBillingSettings(orgId), canEdit: canEdit(role) });
});

billingRoutes.patch('/settings', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (!canEdit(role)) {
    res.status(403).json({ error: FORBIDDEN });
    return;
  }
  const parsed = billingSettingsPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await updateBillingSettings(orgId, parsed.data);
  if ('problem' in outcome) {
    res.status(400).json({ error: outcome.problem });
    return;
  }
  if ('draftsExist' in outcome) {
    res.status(409).json({ error: 'Issue or delete your draft invoices before changing your tax registration or country' });
    return;
  }
  res.status(200).json({ settings: outcome.settings });
});

billingRoutes.get('/rates', async (_req, res) => {
  const { orgId, role } = firmOf(res);
  const { rates, members } = await listRates(orgId, canEdit(role));
  res.status(200).json({ rates, members });
});

billingRoutes.patch('/rates', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (!canEdit(role)) {
    res.status(403).json({ error: FORBIDDEN });
    return;
  }
  const parsed = rateSetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await setRate(orgId, parsed.data);
  if ('notMember' in outcome) {
    res.status(400).json({ error: 'Not a member of this firm' });
    return;
  }
  res.status(200).json({ rates: outcome.rates });
});

// Mounted at /api/clients/:clientId, so the client id is in the path.
type ClientParams = { clientId: string };

export const clientPricingRoutes = Router({ mergeParams: true });
clientPricingRoutes.use('/pricing', express.json({ limit: '10kb' }), requireFirm);

clientPricingRoutes.get<'/pricing', ClientParams>('/pricing', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const outcome = await getPricing(orgId, req.params.clientId);
  if (!outcome) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(200).json({ pricing: outcome.pricing, canEdit: canEdit(role) });
});

clientPricingRoutes.patch<'/pricing', ClientParams>('/pricing', async (req, res) => {
  const { orgId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  if (!canEdit(role)) {
    res.status(403).json({ error: FORBIDDEN });
    return;
  }
  const parsed = pricingSetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const pricing = await setPricing(orgId, req.params.clientId, parsed.data);
  if (!pricing) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(200).json({ pricing });
});
