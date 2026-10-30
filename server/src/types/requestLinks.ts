import { z } from 'zod';

// Client request links (C3). client/src/lib/requestLinks.ts mirrors these. Timestamps are ISO strings; dates are yyyy-mm-dd.
export const REQUEST_LINK_STATUSES = ['active', 'paused', 'complete', 'expired', 'revoked'] as const;
export type RequestLinkStatus = (typeof REQUEST_LINK_STATUSES)[number];

/** Staff view. Never carries the token or its hash. */
export interface RequestLinkView {
  id: string;
  clientId: string;
  recipientEmail: string;
  requestIds: string[];
  expiresAt: string;
  revokedAt: string | null;
  paused: boolean;
  cadenceDays: number[];
  nudgeCount: number;
  lastNudgedAt: string | null;
  openItems: number;
  status: RequestLinkStatus;
  createdBy: string;
  createdAt: string;
}

/** What the anonymous client sees: no entity data, no file names, no email. */
export interface PublicItem { id: string; label: string; received: boolean }
export interface PublicRequestView { firmName: string; expiresOn: string; items: PublicItem[] }

/** What request_link_resolve returns for a live token. */
export interface ResolvedLink { orgId: string; clientId: string; linkId: string }

/** 32 random bytes as base64url. */
export const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const cadenceDays = z
  .array(z.number().int().min(1).max(89))
  .max(5)
  .refine((days) => days.every((d, i) => i === 0 || d > days[i - 1]!), 'Reminder days must go up, for example 3, 7, 14');

export const requestLinkCreateSchema = z
  .strictObject({
    recipientEmail: z.email().max(254),
    requestIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'List each request once'),
    expiresInDays: z.number().int().min(1).max(90).default(30),
    cadenceDays: cadenceDays.default([3, 7, 14]),
  })
  .refine((v) => v.cadenceDays.every((d) => d < v.expiresInDays), {
    message: 'Reminders must fall before the link expires',
    path: ['cadenceDays'],
  });
export type RequestLinkCreate = z.output<typeof requestLinkCreateSchema>;

export const requestLinkPatchSchema = z.strictObject({ paused: z.boolean() });
