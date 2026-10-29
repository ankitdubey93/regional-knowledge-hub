// Workload and capacity (W2). Wire shapes mirror server/src/types/workload.ts.
import { z } from 'zod';
import { CALENDAR_TIMEZONES, type CalendarTimezone } from '@chub/shared/utils/deadlines';
import { apiJson } from './api';

const weekLoadSchema = z.object({ openMinutes: z.number().int(), loadBp: z.number().int().nullable() });
export const workloadRowSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  capacityMinutes: z.number().int(),
  capacityIsDefault: z.boolean(),
  overdueMinutes: z.number().int(),
  thisWeek: weekLoadSchema,
  nextWeek: weekLoadSchema,
  unestimatedCount: z.number().int(),
});
export const workloadViewSchema = z.object({
  timezone: z.enum(CALENDAR_TIMEZONES).nullable(),
  canEdit: z.boolean(),
  weekStart: z.string().nullable(),
  nextWeekStart: z.string().nullable(),
  rows: z.array(workloadRowSchema),
});
export type WorkloadView = z.infer<typeof workloadViewSchema>;

/** GET /workload */
export async function getWorkload(): Promise<WorkloadView> {
  const body = await apiJson<unknown>('/workload');
  return workloadViewSchema.parse(body);
}

/** PATCH /workload/timezone { timezone } → { timezone } */
export async function setFirmTimezone(timezone: CalendarTimezone): Promise<CalendarTimezone> {
  const body = await apiJson<{ timezone: unknown }>('/workload/timezone', { method: 'PATCH', body: { timezone } });
  return z.enum(CALENDAR_TIMEZONES).parse(body.timezone);
}

/** PATCH /workload/capacity/:userId { weeklyMinutes } → { userId, weeklyMinutes }; returns weeklyMinutes. */
export async function setCapacity(userId: string, weeklyMinutes: number): Promise<number> {
  const body = await apiJson<{ userId: unknown; weeklyMinutes: unknown }>(`/workload/capacity/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: { weeklyMinutes },
  });
  return z.number().int().parse(body.weeklyMinutes);
}
