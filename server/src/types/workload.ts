import { z } from 'zod';
import { CALENDAR_TIMEZONES, type CalendarTimezone } from '@chub/shared/utils/deadlines';
import { MAX_WEEKLY_MINUTES, weekStartOf, type WorkloadRow } from '@chub/shared/utils/workload';

/** Wire shape of GET /api/workload. Dates are yyyy-mm-dd. All null/empty until the firm timezone is set. */
export interface WorkloadView {
  timezone: CalendarTimezone | null;
  canEdit: boolean;
  weekStart: string | null;
  nextWeekStart: string | null;
  rows: WorkloadRow[];
}

/** week, when given, must be a real date that is a Monday. */
export const workloadQuerySchema = z.object({
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((w) => weekStartOf(w) === w)
    .optional(),
});

export const firmTimezoneSchema = z.object({ timezone: z.enum(CALENDAR_TIMEZONES) });

export const capacitySchema = z.object({ weeklyMinutes: z.number().int().min(0).max(MAX_WEEKLY_MINUTES) });

export const memberIdSchema = z.string().min(1).max(100);
