// Time entries (B1). Wire shapes mirror server/src/types/time.ts.
import { z } from 'zod';
import { todayIn } from '@chub/shared/utils/deadlines';
import { apiDelete, apiJson } from './api';

export const timeEntryViewSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  engagementId: z.string().nullable(),
  engagementTitle: z.string().nullable(),
  taskId: z.string().nullable(),
  taskTitle: z.string().nullable(),
  workDate: z.string(),
  startedAt: z.string().nullable(),
  minutes: z.number().int().nullable(),
  billable: z.boolean(),
  note: z.string(),
  invoiceId: z.string().nullable(),
  canEdit: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TimeEntryView = z.infer<typeof timeEntryViewSchema>;

export const TIMER_CHANGED_EVENT = 'chub:timer-changed';

/** Tells every TimerChip to refetch. */
export function notifyTimerChanged(): void {
  window.dispatchEvent(new Event(TIMER_CHANGED_EVENT));
}

/** The browser's own date, yyyy-mm-dd. */
export function localToday(): string {
  return todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date());
}

export interface TimeListFilter {
  from?: string;
  to?: string;
  mine?: boolean;
  clientId?: string;
  engagementId?: string;
}
export interface TimeTarget {
  clientId: string;
  engagementId: string | null;
  taskId: string | null;
  workDate: string;
  billable: boolean;
  note: string;
}
export interface TimePatch {
  workDate: string;
  minutes: number;
  billable: boolean;
  note: string;
}

/** GET /time?from&to&mine=1&clientId&engagementId (each only when set, in that order) → entries. */
export async function listTime(f: TimeListFilter): Promise<TimeEntryView[]> {
  const params = new URLSearchParams();
  if (f.from !== undefined) params.set('from', f.from);
  if (f.to !== undefined) params.set('to', f.to);
  if (f.mine) params.set('mine', '1');
  if (f.clientId !== undefined) params.set('clientId', f.clientId);
  if (f.engagementId !== undefined) params.set('engagementId', f.engagementId);
  const query = params.toString();
  const body = await apiJson<{ entries: unknown }>(query === '' ? '/time' : `/time?${query}`);
  return z.array(timeEntryViewSchema).parse(body.entries);
}

/** GET /time/timer → timer or null. */
export async function getTimer(): Promise<TimeEntryView | null> {
  const body = await apiJson<{ timer: unknown }>('/time/timer');
  return timeEntryViewSchema.nullable().parse(body.timer);
}

/** POST /time/timer → { timer }. */
export async function startTimer(t: TimeTarget): Promise<TimeEntryView> {
  const body = await apiJson<{ timer: unknown }>('/time/timer', { method: 'POST', body: t });
  return timeEntryViewSchema.parse(body.timer);
}

/** DELETE /time/timer → { entry, capped }. */
export async function stopTimer(): Promise<{ entry: TimeEntryView; capped: boolean }> {
  const body = await apiJson<{ entry: unknown; capped: unknown }>('/time/timer', { method: 'DELETE' });
  return { entry: timeEntryViewSchema.parse(body.entry), capped: z.boolean().parse(body.capped) };
}

/** POST /time { ...t, minutes } → { entry }. */
export async function addTime(t: TimeTarget & { minutes: number }): Promise<TimeEntryView> {
  const body = await apiJson<{ entry: unknown }>('/time', { method: 'POST', body: t });
  return timeEntryViewSchema.parse(body.entry);
}

/** PATCH /time/:id → { entry }. Always sends all four fields. */
export async function updateTime(id: string, patch: TimePatch): Promise<TimeEntryView> {
  const body = await apiJson<{ entry: unknown }>(`/time/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { workDate: patch.workDate, minutes: patch.minutes, billable: patch.billable, note: patch.note },
  });
  return timeEntryViewSchema.parse(body.entry);
}

/** DELETE /time/:id (204). */
export async function deleteTime(id: string): Promise<void> {
  await apiDelete(`/time/${encodeURIComponent(id)}`);
}

/** GET /clients → [{ id, name }] in the server's order. The server wraps the list as { clients }. */
export async function listEntityOptions(): Promise<{ id: string; name: string }[]> {
  const body = await apiJson<{ clients: unknown }>('/clients');
  return z.array(z.object({ id: z.string(), name: z.string() })).parse(body.clients);
}
