import { useState, type FormEvent } from 'react';
import { formatDay } from '@chub/shared/utils/deadlines';
import { formatMinutes } from '@chub/shared/utils/workload';
import { MAX_ENTRY_MINUTES, MAX_NOTE_CHARS } from '@chub/shared/utils/timesheet';
import { Button, Callout, Field, inputClass, TableScroll } from './ui';
import { ApiError } from '../lib/api';
import { deleteTime, updateTime, type TimeEntryView } from '../lib/time';

const minutesMessage = `Enter whole minutes from 1 to ${MAX_ENTRY_MINUTES}.`;

const HEADERS = ['Date', 'Member', 'Entity', 'Engagement', 'Task', 'Time', 'Billable', 'Note', 'Actions'];

export function TimeEntryTable({
  entries,
  showMember,
  onChanged,
}: {
  entries: TimeEntryView[];
  showMember: boolean;
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers = showMember ? HEADERS : HEADERS.filter((h) => h !== 'Member');
  const colSpan = showMember ? 9 : 8;

  function startEdit(e: TimeEntryView) {
    setEditingId(e.id);
    setDate(e.workDate);
    setMinutes(String(e.minutes ?? ''));
    setNote(e.note);
    setBillable(e.billable);
    setError(null);
  }

  async function save(e: TimeEntryView, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > MAX_ENTRY_MINUTES) {
      setError(minutesMessage);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Enter a date.');
      return;
    }
    try {
      await updateTime(e.id, { workDate: date, minutes: Number(minutes), billable, note });
      setEditingId(null);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not save the time');
    }
  }

  async function remove(e: TimeEntryView) {
    if (!window.confirm('Delete this time entry?')) return;
    setError(null);
    try {
      await deleteTime(e.id);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not save the time');
    }
  }

  return (
    <>
      {error !== null && <Callout tone="bad">{error}</Callout>}
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No time recorded.</p>
      ) : (
        <TableScroll>
          <table className="mt-3 w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} scope="col" className="border-b border-line px-2 py-1 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                if (editingId === e.id) {
                  return (
                    <tr key={e.id}>
                      <td colSpan={colSpan} className="border-b border-line px-2 py-3">
                        <form aria-label="Edit time entry" noValidate className="space-y-3" onSubmit={(ev) => void save(e, ev)}>
                          <Field label="Date">
                            <input type="date" className={inputClass} value={date} onChange={(ev) => setDate(ev.target.value)} />
                          </Field>
                          <Field label="Minutes">
                            <input
                              type="number"
                              min={1}
                              max={MAX_ENTRY_MINUTES}
                              step={1}
                              className={inputClass}
                              value={minutes}
                              onChange={(ev) => setMinutes(ev.target.value)}
                            />
                          </Field>
                          <Field label="Note">
                            <input
                              type="text"
                              maxLength={MAX_NOTE_CHARS}
                              className={inputClass}
                              value={note}
                              onChange={(ev) => setNote(ev.target.value)}
                            />
                          </Field>
                          <label className="mt-3 flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={billable} onChange={(ev) => setBillable(ev.target.checked)} /> Billable
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button type="submit">Save entry</Button>
                            <Button variant="secondary" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={e.id}>
                    <td className="border-b border-line px-2 py-1">{formatDay(e.workDate)}</td>
                    {showMember && <td className="border-b border-line px-2 py-1">{e.userName}</td>}
                    <td className="border-b border-line px-2 py-1">{e.clientName}</td>
                    <td className="border-b border-line px-2 py-1">{e.engagementTitle ?? '—'}</td>
                    <td className="border-b border-line px-2 py-1">{e.taskTitle ?? '—'}</td>
                    <td className="border-b border-line px-2 py-1">{formatMinutes(e.minutes ?? 0)}</td>
                    <td className="border-b border-line px-2 py-1">{e.billable ? 'Yes' : 'No'}</td>
                    <td className="border-b border-line px-2 py-1">{e.note}</td>
                    <td className="border-b border-line px-2 py-1">
                      {e.invoiceId !== null ? (
                        <span className="text-muted">Invoiced</span>
                      ) : e.canEdit ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            aria-label={`Edit time on ${formatDay(e.workDate)} for ${e.clientName}`}
                            onClick={() => startEdit(e)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            aria-label={`Delete time on ${formatDay(e.workDate)} for ${e.clientName}`}
                            onClick={() => void remove(e)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </>
  );
}
