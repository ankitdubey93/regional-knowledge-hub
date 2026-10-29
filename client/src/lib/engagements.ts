// Engagements, tasks and templates (W1). Wire shapes mirror server/src/types/engagements.ts.
import { z } from 'zod';
import { engagementTemplateStepsSchema, seedEngagementTemplateSchema } from '@chub/shared/data/schemas';
import {
  ENGAGEMENT_KINDS,
  ENGAGEMENT_STATUSES,
  TASK_STATUSES,
  type EngagementKind,
  type EngagementStatus,
  type TaskStatus,
} from '@chub/shared/utils/engagements';
import { apiDelete, apiJson } from './api';

export type EngagementFilterStatus = 'active' | EngagementStatus | 'all';

export const engagementViewSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  templateId: z.string().nullable(),
  title: z.string(),
  kind: z.enum(ENGAGEMENT_KINDS),
  periodEnd: z.string().nullable(),
  dueOn: z.string(),
  status: z.enum(ENGAGEMENT_STATUSES),
  obligationId: z.string().nullable(),
  taskCount: z.number().int(),
  doneCount: z.number().int(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EngagementView = z.infer<typeof engagementViewSchema>;

export const taskViewSchema = z.object({
  id: z.string(),
  engagementId: z.string(),
  title: z.string(),
  position: z.number().int(),
  assigneeId: z.string().nullable(),
  dueOn: z.string().nullable(),
  estimateMinutes: z.number().int().nullable(),
  status: z.enum(TASK_STATUSES),
  doneAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskView = z.infer<typeof taskViewSchema>;

export const templateViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(ENGAGEMENT_KINDS),
  seedId: z.string().nullable(),
  steps: engagementTemplateStepsSchema,
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TemplateView = z.infer<typeof templateViewSchema>;

export const seedTemplateSchema = seedEngagementTemplateSchema;
export type SeedTemplate = z.infer<typeof seedTemplateSchema>;

export const memberViewSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
});
export type MemberView = z.infer<typeof memberViewSchema>;

export const ENGAGEMENT_KIND_LABELS: Record<EngagementKind, string> = {
  bookkeeping: 'Bookkeeping',
  bas: 'BAS',
  vat: 'VAT',
  year_end: 'Year end',
  payroll: 'Payroll',
  other: 'Other',
};

export const ENGAGEMENT_STATUS_LABELS: Record<EngagementStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  review: 'Review',
  done: 'Done',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'Doing',
  blocked: 'Blocked',
  done: 'Done',
};

export const FILTER_STATUS_OPTIONS: { value: EngagementFilterStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
];

/** GET /engagements?status=…[&mine=1][&dueBefore=…], built with URLSearchParams in that order. */
export async function listEngagements(f: { status: EngagementFilterStatus; mine: boolean; dueBefore: string | null }): Promise<EngagementView[]> {
  const params = new URLSearchParams();
  params.set('status', f.status);
  if (f.mine) params.set('mine', '1');
  if (f.dueBefore !== null) params.set('dueBefore', f.dueBefore);
  const body = await apiJson<{ engagements: unknown }>(`/engagements?${params.toString()}`);
  return z.array(engagementViewSchema).parse(body.engagements);
}

export async function getEngagement(id: string): Promise<{ engagement: EngagementView; tasks: TaskView[] }> {
  const body = await apiJson<{ engagement: unknown; tasks: unknown }>(`/engagements/${encodeURIComponent(id)}`);
  return {
    engagement: engagementViewSchema.parse(body.engagement),
    tasks: z.array(taskViewSchema).parse(body.tasks),
  };
}

export async function updateEngagement(
  id: string,
  patch: { status?: EngagementStatus; title?: string; dueOn?: string },
): Promise<EngagementView> {
  const body = await apiJson<{ engagement: unknown }>(`/engagements/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
  return engagementViewSchema.parse(body.engagement);
}

export async function deleteEngagement(id: string): Promise<void> {
  await apiDelete(`/engagements/${encodeURIComponent(id)}`);
}

export async function addTask(engagementId: string, title: string): Promise<TaskView> {
  const body = await apiJson<{ task: unknown }>(`/engagements/${encodeURIComponent(engagementId)}/tasks`, {
    method: 'POST',
    body: { title },
  });
  return taskViewSchema.parse(body.task);
}

export async function updateTask(
  engagementId: string,
  taskId: string,
  patch: { status?: TaskStatus; assigneeId?: string | null; dueOn?: string | null; estimateMinutes?: number | null; title?: string },
): Promise<TaskView> {
  const body = await apiJson<{ task: unknown }>(
    `/engagements/${encodeURIComponent(engagementId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'PATCH', body: patch },
  );
  return taskViewSchema.parse(body.task);
}

export async function moveTask(engagementId: string, taskId: string, direction: 'up' | 'down'): Promise<TaskView[]> {
  const body = await apiJson<{ tasks: unknown }>(
    `/engagements/${encodeURIComponent(engagementId)}/tasks/${encodeURIComponent(taskId)}/move`,
    { method: 'POST', body: { direction } },
  );
  return z.array(taskViewSchema).parse(body.tasks);
}

export async function deleteTask(engagementId: string, taskId: string): Promise<void> {
  await apiDelete(`/engagements/${encodeURIComponent(engagementId)}/tasks/${encodeURIComponent(taskId)}`);
}

export async function listMembers(): Promise<MemberView[]> {
  const body = await apiJson<{ members: unknown }>('/engagements/members');
  return z.array(memberViewSchema).parse(body.members);
}

export async function listClientEngagements(clientId: string): Promise<{ engagements: EngagementView[]; autoEngagements: boolean }> {
  const body = await apiJson<{ engagements: unknown; autoEngagements: unknown }>(`/clients/${encodeURIComponent(clientId)}/engagements`);
  return {
    engagements: z.array(engagementViewSchema).parse(body.engagements),
    autoEngagements: z.boolean().parse(body.autoEngagements),
  };
}

export async function createEngagement(
  clientId: string,
  input: { templateId: string; title: string; dueOn: string; periodEnd: string | null },
): Promise<EngagementView> {
  const body = await apiJson<{ engagement: unknown }>(`/clients/${encodeURIComponent(clientId)}/engagements`, {
    method: 'POST',
    body: input,
  });
  return engagementViewSchema.parse(body.engagement);
}

export async function setAutoEngagements(clientId: string, enabled: boolean): Promise<boolean> {
  const body = await apiJson<{ autoEngagements: unknown }>(`/clients/${encodeURIComponent(clientId)}/engagements/auto`, {
    method: 'PATCH',
    body: { enabled },
  });
  return z.boolean().parse(body.autoEngagements);
}

export async function openEngagements(clientId: string): Promise<{ created: number; engagements: EngagementView[] }> {
  const body = await apiJson<{ created: unknown; engagements: unknown }>(`/clients/${encodeURIComponent(clientId)}/engagements/open`, {
    method: 'POST',
    body: {},
  });
  return {
    created: z.number().int().parse(body.created),
    engagements: z.array(engagementViewSchema).parse(body.engagements),
  };
}

export async function listTemplates(): Promise<{ seeded: SeedTemplate[]; templates: TemplateView[] }> {
  const body = await apiJson<{ seeded: unknown; templates: unknown }>('/engagement-templates');
  return {
    seeded: z.array(seedTemplateSchema).parse(body.seeded),
    templates: z.array(templateViewSchema).parse(body.templates),
  };
}

export async function copyTemplate(seedId: string): Promise<TemplateView> {
  const body = await apiJson<{ template: unknown }>('/engagement-templates', { method: 'POST', body: { seedId } });
  return templateViewSchema.parse(body.template);
}

export async function getTemplate(id: string): Promise<TemplateView> {
  const body = await apiJson<{ template: unknown }>(`/engagement-templates/${encodeURIComponent(id)}`);
  return templateViewSchema.parse(body.template);
}

export async function updateTemplate(
  id: string,
  patch: { name?: string; steps?: { title: string; estimateMinutes: number | null }[] },
): Promise<TemplateView> {
  const body = await apiJson<{ template: unknown }>(`/engagement-templates/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
  return templateViewSchema.parse(body.template);
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiDelete(`/engagement-templates/${encodeURIComponent(id)}`);
}
