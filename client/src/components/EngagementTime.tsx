import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { formatMinutes } from '@chub/shared/utils/workload';
import { MAX_ENTRY_MINUTES, MAX_NOTE_CHARS, sumMinutes } from '@chub/shared/utils/timesheet';
import { Button, Callout, Card, Field, inputClass } from './ui';
import { TimeEntryTable } from './TimeEntryTable';
import { ApiError } from '../lib/api';
import type { EngagementView, TaskView } from '../lib/engagements';
import { addTime, getTimer, listTime, localToday, notifyTimerChanged, startTimer, TIMER_CHANGED_EVENT, type TimeEntryView } from '../lib/time';

const minutesMessage = `Enter whole minutes from 1 to ${MAX_ENTRY_MINUTES}.`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/** The time card on an engagement: its logged time, and a form to add or start time against it. */
export function EngagementTime({ engagement, tasks }: { engagement: EngagementView; tasks: TaskView[] }) {
  const [entries, setEntries] = useState<TimeEntryView[]>([]);
  const [timer, setTimer] = useState<TimeEntryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [date, setDate] = useState(() => localToday());
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [billable, setBillable] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [list, t] = await Promise.all([listTime({ engagementId: engagement.id }), getTimer()]);
      setEntries(list);
      setTimer(t);
      setError(null);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not load your time'));
    }
  }, [engagement.id]);

  useEffect(() => {
    void reload();
    window.addEventListener(TIMER_CHANGED_EVENT, reload);
    return () => window.removeEventListener(TIMER_CHANGED_EVENT, reload);
  }, [reload]);

  async function addSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > MAX_ENTRY_MINUTES) {
      setError(minutesMessage);
      return;
    }
    if (!DATE_RE.test(date)) {
      setError('Enter a date.');
      return;
    }
    try {
      await addTime({
        clientId: engagement.clientId,
        engagementId: engagement.id,
        taskId: task === '' ? null : task,
        workDate: date,
        billable,
        note,
        minutes: Number(minutes),
      });
      setMessage('Time added.');
      setMinutes('');
      setNote('');
      await reload();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not save the time'));
    }
  }

  async function startSubmit() {
    setError(null);
    setMessage(null);
    try {
      const started = await startTimer({
        clientId: engagement.clientId,
        engagementId: engagement.id,
        taskId: task === '' ? null : task,
        workDate: localToday(),
        billable,
        note,
      });
      setTimer(started);
      setMessage('Timer started.');
      notifyTimerChanged();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not start the timer'));
    }
  }

  const totals = sumMinutes(entries);

  return (
    <Card>
      <h2 className="font-semibold">Time</h2>
      <p className="mt-1 text-sm text-muted">{`Logged: ${formatMinutes(totals.minutes)} (${formatMinutes(totals.billableMinutes)} billable)`}</p>
      {error !== null && <Callout tone="bad">{error}</Callout>}
      <p role="status" className="mt-2 text-sm text-muted">
        {message ?? ''}
      </p>
      <TimeEntryTable entries={entries} showMember onChanged={() => void reload()} />

      <form aria-label="Log time on this engagement" noValidate className="mt-4 space-y-3" onSubmit={(e) => void addSubmit(e)}>
        <Field label="Task">
          <select className={inputClass} value={task} onChange={(e) => setTask(e.target.value)}>
            <option value="">No task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Minutes">
          <input
            type="number"
            min={1}
            max={MAX_ENTRY_MINUTES}
            step={1}
            className={inputClass}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </Field>
        <Field label="Note">
          <input type="text" maxLength={MAX_NOTE_CHARS} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} /> Billable
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit">Add entry</Button>
          <Button variant="secondary" type="button" disabled={timer !== null} onClick={() => void startSubmit()}>
            Start timer on this engagement
          </Button>
        </div>
        {timer !== null && <p className="mt-2 text-sm text-muted">A timer is already running.</p>}
      </form>
    </Card>
  );
}
