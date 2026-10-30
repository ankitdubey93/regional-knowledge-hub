import express, { Router, type Response } from 'express';
import { z } from 'zod';
import { limitByUser } from '../middleware/rateLimit';
import { requireFirm } from '../middleware/session';
import {
  commitTrialBalance,
  deleteImport,
  getBalanceSheet,
  getProfitAndLoss,
  listAccounts,
  listImports,
  updateAccountClass,
  type ReportOutcome,
} from '../services/ledgerService';
import { actorFrom } from '../services/auditEventService';
import { firmOf } from '../types';
import { accountPatchSchema, reportQuerySchema, tbCommitSchema } from '../types/ledger';

// Mounted at /api/clients/:clientId, before clientRoutes (see app.ts).
export const ledgerRoutes = Router({ mergeParams: true });
ledgerRoutes.use(['/ledger', '/reports'], express.json({ limit: '10mb' }), requireFirm);

const idSchema = z.uuid();

type ClientParams = { clientId: string };
type ImportParams = ClientParams & { importId: string };
type AccountParams = ClientParams & { accountId: string };

function invalid(res: Response, issues: unknown): void {
  res.status(400).json({ error: 'Invalid input', issues });
}

function sendReport<T>(res: Response, outcome: ReportOutcome<T>): void {
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Import not found' });
    return;
  }
  if ('currencyMismatch' in outcome) {
    res.status(400).json({ error: 'Both imports must be in the same currency' });
    return;
  }
  res.status(200).json({ report: outcome });
}

// orgId, userId and role come only from firmOf(res), which requireFirm set from the session (Hard rule 11).
ledgerRoutes.get<'/ledger/imports', ClientParams>('/ledger/imports', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const imports = await listImports(orgId, req.params.clientId);
  if (!imports) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(200).json({ imports });
});

ledgerRoutes.post<'/ledger/imports', ClientParams>('/ledger/imports', limitByUser('ledgerImport'), async (req, res) => {
  const { orgId, userId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const parsed = tbCommitSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const outcome = await commitTrialBalance(orgId, actorFrom(userId, req.ip), req.params.clientId, parsed.data);
  if ('notFound' in outcome) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  if ('currencyError' in outcome) {
    res.status(400).json({ error: outcome.currencyError });
    return;
  }
  if ('issues' in outcome) {
    res.status(400).json({ error: 'The trial balance has problems', issues: outcome.issues });
    return;
  }
  res.status(201).json({ import: outcome.import, supersededId: outcome.supersededId });
});

ledgerRoutes.delete<'/ledger/imports/:importId', ImportParams>('/ledger/imports/:importId', async (req, res) => {
  const { orgId, userId, role } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  if (!idSchema.safeParse(req.params.importId).success) {
    res.status(404).json({ error: 'Import not found' });
    return;
  }
  if (role === 'member') {
    res.status(403).json({ error: 'Only firm owners and admins can delete imports' });
    return;
  }
  const outcome = await deleteImport(orgId, actorFrom(userId, req.ip), req.params.clientId, req.params.importId);
  if (outcome === 'not_found') {
    res.status(404).json({ error: 'Import not found' });
    return;
  }
  res.status(204).end();
});

ledgerRoutes.get<'/ledger/accounts', ClientParams>('/ledger/accounts', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const accounts = await listAccounts(orgId, req.params.clientId);
  if (!accounts) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  res.status(200).json({ accounts });
});

ledgerRoutes.patch<'/ledger/accounts/:accountId', AccountParams>('/ledger/accounts/:accountId', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  if (!idSchema.safeParse(req.params.accountId).success) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  const parsed = accountPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const account = await updateAccountClass(orgId, req.params.clientId, req.params.accountId, parsed.data.accountClass);
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.status(200).json({ account });
});

ledgerRoutes.get<'/reports/profit-and-loss', ClientParams>('/reports/profit-and-loss', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const parsed = reportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const outcome = await getProfitAndLoss(orgId, req.params.clientId, parsed.data.importId, parsed.data.compareImportId ?? null);
  sendReport(res, outcome);
});

ledgerRoutes.get<'/reports/balance-sheet', ClientParams>('/reports/balance-sheet', async (req, res) => {
  const { orgId } = firmOf(res);
  if (!idSchema.safeParse(req.params.clientId).success) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  const parsed = reportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    invalid(res, parsed.error.issues);
    return;
  }
  const outcome = await getBalanceSheet(orgId, req.params.clientId, parsed.data.importId, parsed.data.compareImportId ?? null);
  sendReport(res, outcome);
});
