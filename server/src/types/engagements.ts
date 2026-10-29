import { z } from 'zod';
import { engagementTemplateStepsSchema, type EngagementTemplateStep } from '@chub/shared/data/schemas';
import {
  ENGAGEMENT_STATUSES,
  TASK_STATUSES,
  type EngagementKind,
  type EngagementStatus,
  type TaskStatus,
} from '@chub/shared/utils/engagements';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const nonEmpty = (o: object) => Object.keys(o).length > 0;

/** Wire shapes. Dates are yyyy-mm-dd; timestamps are ISO strings. */
export interface EngagementView {
  id: string;
  clientId: string;
  clientName: string;
  templateId: string | null;
  title: string;
  kind: EngagementKind;
  periodEnd: string | null;
  dueOn: string;
  status: EngagementStatus;
  obligationId: string | null;
  taskCount: number;
  doneCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskView {
  id: string;
  engagementId: string;
  title: string;
  position: number;
  assigneeId: string | null;
  dueOn: string | null;
  estimateMinutes: number | null;
  status: TaskStatus;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateView {
  id: string;
  name: string;
  kind: EngagementKind;
  seedId: string | null;
  steps: EngagementTemplateStep[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemberView {
  userId: string;
  name: string;
  email: string;
}

export const ENGAGEMENT_FILTER_STATUSES = ['active', ...ENGAGEMENT_STATUSES, 'all'] as const;
export const engagementFilterSchema = z.object({
  status: z.enum(ENGAGEMENT_FILTER_STATUSES).default('active'),
  mine: z.enum(['1']).optional(),
  clientId: z.uuid().optional(),
  dueBefore: isoDate.optional(),
});
export type EngagementFilter = z.infer<typeof engagementFilterSchema>;

export const engagementCreateSchema = z.object({
  templateId: z.string().regex(/^(seed:[a-z0-9-]+|firm:[0-9a-f-]{36})$/),
  title: z.string().trim().min(1).max(200),
  dueOn: isoDate,
  periodEnd: isoDate.nullable(),
});
export type EngagementCreate = z.infer<typeof engagementCreateSchema>;

export const engagementPatchSchema = z
  .object({ title: z.string().trim().min(1).max(200), dueOn: isoDate, status: z.enum(ENGAGEMENT_STATUSES) })
  .partial()
  .refine(nonEmpty, { message: 'Nothing to update' });
export type EngagementPatch = z.infer<typeof engagementPatchSchema>;

export const autoEngagementsSchema = z.object({ enabled: z.boolean() });

export const taskCreateSchema = z.object({ title: z.string().trim().min(1).max(300) });
export type TaskCreate = z.infer<typeof taskCreateSchema>;

export const taskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    status: z.enum(TASK_STATUSES),
    assigneeId: z.string().min(1).max(100).nullable(),
    dueOn: isoDate.nullable(),
    estimateMinutes: z.number().int().min(0).max(10000).nullable(),
  })
  .partial()
  .refine(nonEmpty, { message: 'Nothing to update' });
export type TaskPatch = z.infer<typeof taskPatchSchema>;

export const taskMoveSchema = z.object({ direction: z.enum(['up', 'down']) });
export type TaskMove = z.infer<typeof taskMoveSchema>;

export const templateCopySchema = z.object({ seedId: z.string().regex(/^[a-z0-9-]+$/) });
export type TemplateCopy = z.infer<typeof templateCopySchema>;

export const templatePatchSchema = z
  .object({ name: z.string().trim().min(1).max(120), steps: engagementTemplateStepsSchema })
  .partial()
  .refine(nonEmpty, { message: 'Nothing to update' });
export type TemplatePatch = z.infer<typeof templatePatchSchema>;
