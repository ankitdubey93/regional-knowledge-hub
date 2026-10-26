import type { Response } from 'express';
import { z } from 'zod';

export const firmRoleSchema = z.enum(['owner', 'admin', 'member']);
export type FirmRole = z.infer<typeof firmRoleSchema>;

export const workspaceKindSchema = z.enum(['business', 'practice']);
export type WorkspaceKind = z.infer<typeof workspaceKindSchema>;
export interface FirmContext { userId: string; orgId: string; role: FirmRole; kind: WorkspaceKind }
export interface AdminContext { userId: string; email: string }

declare global {
  namespace Express {
    interface Locals {
      firm?: FirmContext;
      admin?: AdminContext;
    }
  }
}

/** The firm requireFirm resolved from the session. Throws if a route was mounted without requireFirm. */
export function firmOf(res: Response): FirmContext {
  const firm: FirmContext | undefined = res.locals.firm;
  if (!firm) throw new Error('requireFirm did not run');
  return firm;
}

/** The admin requireAdmin resolved. Throws if a route was mounted without requireAdmin. */
export function adminOf(res: Response): AdminContext {
  const admin: AdminContext | undefined = res.locals.admin;
  if (!admin) throw new Error('requireAdmin did not run');
  return admin;
}
