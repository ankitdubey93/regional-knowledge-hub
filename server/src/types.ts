import type { Response } from 'express';
import { z } from 'zod';

export const firmRoleSchema = z.enum(['owner', 'admin', 'member']);
export type FirmRole = z.infer<typeof firmRoleSchema>;

export const workspaceKindSchema = z.enum(['business', 'practice']);
export type WorkspaceKind = z.infer<typeof workspaceKindSchema>;
export interface FirmContext { userId: string; orgId: string; role: FirmRole; kind: WorkspaceKind }

declare global {
  namespace Express {
    interface Locals {
      firm?: FirmContext;
    }
  }
}

/** The firm requireFirm resolved from the session. Throws if a route was mounted without requireFirm. */
export function firmOf(res: Response): FirmContext {
  const firm: FirmContext | undefined = res.locals.firm;
  if (!firm) throw new Error('requireFirm did not run');
  return firm;
}
