import { z } from 'zod';
import type { conversation } from '../db/schema';
import { chatScopeSchema } from '../../../src/lib/chatWire';

export const conversationCreateSchema = z
  .object({ clientId: z.uuid().nullable(), scope: chatScopeSchema.nullable() })
  .refine((o) => (o.clientId === null) !== (o.scope === null), { message: 'Give a client or a scope, not both' });
export const conversationPatchSchema = z.object({ title: z.string().trim().min(1).max(80) });
export const messageInputSchema = z.object({ text: z.string().trim().min(1).max(4000) });
export const listQuerySchema = z.object({ clientId: z.union([z.uuid(), z.literal('none')]) });

export const CHAT_MESSAGES = {
  notConfigured: "The assistant isn't configured on this server.",
  notYours: 'Only the person who started this chat, or a workspace owner or admin, can change or delete it.',
  userLimit: (n: number) => `You've reached today's limit of ${n} questions. It resets at midnight UTC.`,
  spendCap: 'The assistant has reached its spending limit for today. Try again after midnight UTC.',
  failed: 'Something went wrong. Try again.',
} as const;

export type ConversationRow = typeof conversation.$inferSelect;
