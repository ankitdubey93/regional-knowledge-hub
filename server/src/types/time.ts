import { z } from 'zod';
import { addDays } from '@chub/shared/utils/deadlines';
import { MAX_ENTRY_MINUTES, MAX_NOTE_CHARS } from '@chub/shared/utils/timesheet';

/** yyyy-mm-dd that is a real calendar date (2026-02-31 is refused). */
const realDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((d) => {
    // addDays throws a RangeError on an impossible date; a throw inside refine would escape safeParse as a 500.
    try {
      return addDays(d, 0) === d;
    } catch {
      return false;
    }
  }, 'Not a real date');
const nonEmpty = (o: object) => Object.keys(o).length > 0;

/** Wire shape. Dates are yyyy-mm-dd; timestamps are ISO strings. minutes is null only for a running timer. */
export interface TimeEntryView {
  id: string;
  userId: string;
  userName: string;
  clientId: string;
  clientName: string;
  engagementId: string | null;
  engagementTitle: string | null;
  taskId: string | null;
  taskTitle: string | null;
  workDate: string;
  startedAt: string | null;
  minutes: number | null;
  billable: boolean;
  note: string;
  invoiceId: string | null;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export const timeFilterSchema = z.object({
  from: realDate.optional(),
  to: realDate.optional(),
  mine: z.enum(['1']).optional(),
  clientId: z.uuid().optional(),
  engagementId: z.uuid().optional(),
});
export type TimeFilter = z.infer<typeof timeFilterSchema>;

const target = {
  clientId: z.uuid(),
  engagementId: z.uuid().nullable().default(null),
  taskId: z.uuid().nullable().default(null),
  workDate: realDate,
  billable: z.boolean().default(true),
  note: z.string().trim().max(MAX_NOTE_CHARS).default(''),
};
const taskNeedsEngagement = (v: { engagementId: string | null; taskId: string | null }) => v.taskId === null || v.engagementId !== null;

export const timerStartSchema = z.object(target).refine(taskNeedsEngagement, { message: 'A task needs an engagement' });
export type TimerStart = z.infer<typeof timerStartSchema>;

export const timeEntryCreateSchema = z
  .object({ ...target, minutes: z.number().int().min(1).max(MAX_ENTRY_MINUTES) })
  .refine(taskNeedsEngagement, { message: 'A task needs an engagement' });
export type TimeEntryCreate = z.infer<typeof timeEntryCreateSchema>;

export const timeEntryPatchSchema = z
  .object({
    workDate: realDate,
    minutes: z.number().int().min(1).max(MAX_ENTRY_MINUTES),
    billable: z.boolean(),
    note: z.string().trim().max(MAX_NOTE_CHARS),
  })
  .partial()
  .refine(nonEmpty, { message: 'Nothing to update' });
export type TimeEntryPatch = z.infer<typeof timeEntryPatchSchema>;
