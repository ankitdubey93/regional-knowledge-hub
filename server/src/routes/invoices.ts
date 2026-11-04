import express, { Router, type Response } from 'express';
import { z } from 'zod';
import { requireFirm } from '../middleware/session';
import { actorFrom } from '../services/auditEventService';
import {
  addLine,
  createDraft,
  deleteDraft,
  deleteLine,
  getInvoice,
  invoiceCsv,
  issueInvoice,
  listInvoices,
  updateDraft,
  updateLine,
  voidInvoice,
  type EditOutcome,
} from '../services/invoiceService';
import {
  invoiceCreateSchema,
  invoiceFilterSchema,
  invoicePatchSchema,
  issueSchema,
  lineCreateSchema,
  linePatchSchema,
  voidSchema,
  type InvoiceView,
} from '../types/invoices';
import { firmOf, type FirmRole } from '../types';

// Mounted at /api/invoices. orgId, userId and role come only from requireFirm (Hard rule 11). Never logs invoice text (Hard rule 13).

export const invoiceRoutes = Router();
invoiceRoutes.use(express.json({ limit: '100kb' }), requireFirm);

const idSchema = z.uuid();
const ownersAndAdmins = (role: FirmRole) => role === 'owner' || role === 'admin';

type EditFailure = Exclude<EditOutcome, { invoice: InvoiceView }>;

/** Maps every failure of an edit to a draft or its lines to the status and message in the B2 route table. */
function sendEditFailure(res: Response, outcome: EditFailure): void {
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if ('lineNotFound' in outcome) {
    res.status(404).json({ error: 'Line not found' });
    return;
  }
  if ('notDraft' in outcome) {
    res.status(409).json({ error: 'Only a draft can be changed' });
    return;
  }
  if ('badTreatment' in outcome) {
    res.status(400).json({ error: 'That tax treatment is not available for this invoice' });
    return;
  }
  if ('timeAmount' in outcome) {
    res.status(400).json({ error: "A time line's amount comes from its minutes and rate" });
    return;
  }
  if ('fxNotNeeded' in outcome) {
    res.status(400).json({ error: 'An exchange rate is only for an invoice in another currency' });
    return;
  }
  if ('tooManyLines' in outcome) {
    res.status(409).json({ error: 'Too many lines for one invoice (at most 500)' });
    return;
  }
  if ('overLimit' in outcome) {
    res.status(409).json({ error: 'The invoice total is over the limit' });
  }
}

invoiceRoutes.get('/', async (req, res) => {
  const { orgId } = firmOf(res);
  const parsed = invoiceFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid filter' });
    return;
  }
  res.status(200).json({ invoices: await listInvoices(orgId, parsed.data) });
});

invoiceRoutes.post('/', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  const parsed = invoiceCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await createDraft(orgId, { userId, role }, parsed.data);
  if ('invoice' in outcome) {
    res.status(201).json({ invoice: outcome.invoice });
    return;
  }
  if ('noSettings' in outcome) {
    res.status(409).json({ error: 'Set up your billing details first' });
    return;
  }
  if ('badClient' in outcome) {
    res.status(400).json({ error: 'Unknown entity' });
    return;
  }
  if ('badEngagement' in outcome) {
    res.status(400).json({ error: 'Engagement is not for this entity' });
    return;
  }
  if ('noPricing' in outcome) {
    res.status(409).json({ error: "Set this entity's pricing first" });
    return;
  }
  if ('needsEngagement' in outcome) {
    res.status(400).json({ error: 'A fixed fee needs an engagement' });
    return;
  }
  if ('nothingToBill' in outcome) {
    res.status(409).json({ error: 'There is no unbilled time in this period' });
    return;
  }
  if ('noRate' in outcome) {
    res.status(409).json({ error: `No hourly rate in ${outcome.noRate.currency} for ${outcome.noRate.userName}. Set one on the Billing page.` });
    return;
  }
  if ('tooManyLines' in outcome) {
    res.status(409).json({ error: 'Too many lines for one invoice (at most 500)' });
    return;
  }
  if ('overLimit' in outcome) {
    res.status(409).json({ error: 'The invoice total is over the limit' });
    return;
  }
  if ('conflict' in outcome) {
    res.status(409).json({ error: 'Some of this time was just billed on another invoice. Try again.' });
    return;
  }
  res.status(500).json({ error: 'The tax rate is not available. Ask the platform admin.' });
});

// Registered before /:id so that the sub-resources are not read as an invoice id.
invoiceRoutes.get('/:id/csv', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  const outcome = await invoiceCsv(orgId, req.params.id);
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if ('notIssued' in outcome) {
    res.status(409).json({ error: 'Only an issued invoice can be exported' });
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${outcome.filename}"`);
  res.status(200).send(outcome.csv);
});

invoiceRoutes.post('/:id/issue', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if (!ownersAndAdmins(role)) {
    res.status(403).json({ error: 'Only firm owners and admins can issue invoices' });
    return;
  }
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await issueInvoice(orgId, actorFrom(userId, req.ip), { userId, role }, req.params.id, parsed.data);
  if ('invoice' in outcome) {
    res.status(200).json({ invoice: outcome.invoice });
    return;
  }
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if ('notDraft' in outcome) {
    res.status(409).json({ error: 'Only a draft can be issued' });
    return;
  }
  if ('noLines' in outcome) {
    res.status(409).json({ error: 'Add at least one line first' });
    return;
  }
  if ('incompleteSettings' in outcome) {
    res.status(409).json({ error: 'Complete your billing details first: legal name, address and country' });
    return;
  }
  if ('schemeChanged' in outcome) {
    res.status(409).json({ error: 'Your tax registration changed since this draft was made. Delete it and create it again.' });
    return;
  }
  if ('needsBuyerAddress' in outcome) {
    res.status(409).json({ error: "Add the customer's address. A UK VAT invoice must show it." });
    return;
  }
  if ('needsFx' in outcome) {
    res.status(409).json({ error: `Enter the exchange rate, its date and its source. The tax must also be shown in ${outcome.homeCurrency}.` });
    return;
  }
  if ('overLimit' in outcome) {
    res.status(409).json({ error: 'The invoice total is over the limit' });
    return;
  }
  res.status(500).json({ error: 'The tax rate is not available. Ask the platform admin.' });
});

invoiceRoutes.post('/:id/void', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if (!ownersAndAdmins(role)) {
    res.status(403).json({ error: 'Only firm owners and admins can void invoices' });
    return;
  }
  const parsed = voidSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await voidInvoice(orgId, actorFrom(userId, req.ip), { userId, role }, req.params.id, parsed.data);
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if ('notIssued' in outcome) {
    res.status(409).json({ error: 'Only an issued invoice can be voided' });
    return;
  }
  res.status(200).json({ invoice: outcome.invoice });
});

invoiceRoutes.post('/:id/lines', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  const parsed = lineCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await addLine(orgId, { userId, role }, req.params.id, parsed.data);
  if ('invoice' in outcome) {
    res.status(201).json({ invoice: outcome.invoice });
    return;
  }
  sendEditFailure(res, outcome);
});

invoiceRoutes.patch('/:id/lines/:lineId', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if (!idSchema.safeParse(req.params.lineId).success) {
    res.status(404).json({ error: 'Line not found' });
    return;
  }
  const parsed = linePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await updateLine(orgId, { userId, role }, req.params.id, req.params.lineId, parsed.data);
  if ('invoice' in outcome) {
    res.status(200).json({ invoice: outcome.invoice });
    return;
  }
  sendEditFailure(res, outcome);
});

invoiceRoutes.delete('/:id/lines/:lineId', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if (!idSchema.safeParse(req.params.lineId).success) {
    res.status(404).json({ error: 'Line not found' });
    return;
  }
  const outcome = await deleteLine(orgId, { userId, role }, req.params.id, req.params.lineId);
  if ('invoice' in outcome) {
    res.status(200).json({ invoice: outcome.invoice });
    return;
  }
  sendEditFailure(res, outcome);
});

invoiceRoutes.get('/:id', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  const invoice = await getInvoice(orgId, { userId, role }, req.params.id);
  if (!invoice) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  res.status(200).json({ invoice });
});

invoiceRoutes.patch('/:id', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  const parsed = invoicePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', issues: parsed.error.issues });
    return;
  }
  const outcome = await updateDraft(orgId, { userId, role }, req.params.id, parsed.data);
  if ('invoice' in outcome) {
    res.status(200).json({ invoice: outcome.invoice });
    return;
  }
  sendEditFailure(res, outcome);
});

invoiceRoutes.delete('/:id', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.id).success) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  const outcome = await deleteDraft(orgId, req.params.id);
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }
  if ('notDraft' in outcome) {
    res.status(409).json({ error: 'An issued invoice cannot be deleted. Void it instead.' });
    return;
  }
  res.status(204).end();
});
