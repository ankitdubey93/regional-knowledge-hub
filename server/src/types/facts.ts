import { z } from 'zod';
import { factKeySchema, factSchema, type Fact } from '@chub/shared/data/schemas';
import { KB_JURISDICTIONS } from '../db/schema';
export type { Fact };
const changeNote = z.string().trim().min(3).max(500);
export const factCreateSchema = z.object({ key: factKeySchema, fact: factSchema, changeNote, confirmVerified: z.boolean() });
export const factUpdateSchema = z.object({ fact: factSchema, changeNote, confirmVerified: z.boolean() });
export const factListQuerySchema = z.object({ q: z.string().trim().max(200).default(''), jurisdiction: z.enum(KB_JURISDICTIONS).optional() });
export type FactCreate = z.infer<typeof factCreateSchema>;
export type FactUpdate = z.infer<typeof factUpdateSchema>;
export interface FactUsage { sourceId: string; title: string; sitePath: string | null }
export interface AdminFactRow { key: string; fact: Fact; updatedBy: string; updatedAt: Date; docCount: number }
export interface FactHistoryRow { id: string; fact: Fact; changeNote: string; changedBy: string; changedAt: Date }
export interface AdminFactDetail { key: string; fact: Fact; updatedBy: string; updatedAt: Date; docs: FactUsage[]; history: FactHistoryRow[] }
export interface FactSaveResult { detail: AdminFactDetail; rechunked: number; embedded: number | null }
