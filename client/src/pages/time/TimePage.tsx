import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, formatDay } from '@chub/shared/utils/deadlines';
import { formatMinutes, weekStartOf } from '@chub/shared/utils/workload';
import { dayTotals, formatElapsed, MAX_ENTRY_MINUTES, MAX_NOTE_CHARS, sumMinutes } from '@chub/shared/utils/timesheet';
import { Button, Callout, Card, Field, inputClass, PageHeader, TableScroll } from '../../components/ui';
import { TimeEntryTable } from '../../components/TimeEntryTable';
import { ApiError } from '../../lib/api';
import { listClientEngagements, type EngagementView } from '../../lib/engagements';
import {
  addTime,
  getTimer,
  listEntityOptions,
  listTime,
  localToday,
  notifyTimerChanged,
  startTimer,
  stopTimer,
  type TimeEntryView,
} from '../../lib/time';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const minutesMessage = `Enter whole minutes from 1 to ${MAX_ENTRY_MINUTES}.`;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function TimePage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('week');
  const weekStart = asked !== null && DATE_RE.test(asked) && weekStartOf(asked) === asked ? asked : weekStartOf(localToday());

  const [entities, setEntities] = useState<{ id: string; name: string }[]>([]);
  const [timer, setTimer] = useState<TimeEntryView | null>(null);
  const [entries, setEntries] = useState<TimeEntryView[]>([]);
  const [engagementsByClient, setEngagementsByClient] = useState<Record<string, EngagementView[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Timer form
  const [timerClientId, setTimerClientId] = useState('');
  const [timerEngagement, setTimerEngagement] = useState('');
  const [timerNote, setTimerNote] = useState('');
  const [timerBillable, setTimerBillable] = useState(true);

  // Add form
  const [addClientId, setAddClientId] = useState('');
  const [addEngagement, setAddEngagement] = useState('');
  const [addDate, setAddDate] = useState(() => localToday());
  const [addMinutes, setAddMinutes] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addBillable, setAddBillable] = useState(true);

  const timerClient = timerClientId !== '' ? timerClientId : (entities[0]?.id ?? '');
  const addClient = addClientId !== '' ? addClientId : (entities[0]?.id ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [opts, t, list] = await Promise.all([
        listEntityOptions(),
        getTimer(),
        listTime({ from: weekStart, to: addDays(weekStart, 6), mine: true }),
      ]);
      setEntities(opts);
      setTimer(t);
      setEntries(list);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not load your time'));
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  const reload = useCallback(async () => {
    try {
      const [t, list] = await Promise.all([getTimer(), listTime({ from: weekStart, to: addDays(weekStart, 6), mine: true })]);
      setTimer(t);
      setEntries(list);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not load your time'));
    }
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    for (const id of [timerClient, addClient]) {
      if (id === '' || engagementsByClient[id] !== undefined) continue;
      void listClientEngagements(id).then(
        (r) => setEngagementsByClient((m) => ({ ...m, [id]: r.engagements })),
        (err: unknown) => setError(errorMessage(err, 'Could not load your time')),
      );
    }
  }, [timerClient, addClient, engagementsByClient]);

  useEffect(() => {
    if (timer === null) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  function setWeek(day: string) {
    setParams({ week: day });
  }

  async function stop() {
    setError(null);
    setMessage(null);
    try {
      const { entry, capped } = await stopTimer();
      setMessage(capped ? 'Timer stopped at 24 hours. Edit the entry if that is wrong.' : `Timer stopped: ${formatMinutes(entry.minutes ?? 0)}.`);
      notifyTimerChanged();
      await reload();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not stop the timer'));
    }
  }

  async function startTimerSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const started = await startTimer({
        clientId: timerClient,
        engagementId: timerEngagement === '' ? null : timerEngagement,
        taskId: null,
        workDate: localToday(),
        billable: timerBillable,
        note: timerNote,
      });
      setTimer(started);
      setMessage('Timer started.');
      notifyTimerChanged();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not start the timer'));
    }
  }

  async function addSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!/^\d+$/.test(addMinutes) || Number(addMinutes) < 1 || Number(addMinutes) > MAX_ENTRY_MINUTES) {
      setError(minutesMessage);
      return;
    }
    if (!DATE_RE.test(addDate)) {
      setError('Enter a date.');
      return;
    }
    try {
      await addTime({
        clientId: addClient,
        engagementId: addEngagement === '' ? null : addEngagement,
        taskId: null,
        workDate: addDate,
        billable: addBillable,
        note: addNote,
        minutes: Number(addMinutes),
      });
      setMessage('Time added.');
      setAddMinutes('');
      setAddNote('');
      await reload();
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not save the time'));
    }
  }

  const timerEngagements = engagementsByClient[timerClient] ?? [];
  const addEngagements = engagementsByClient[addClient] ?? [];
  const runningSince = timer?.startedAt ?? null;
  const totals = sumMinutes(entries);

  return (
    <div className="space-y-6">
      <PageHeader title="Time" lead="Your time, by day. Start a timer or add time by hand. Time on an invoice cannot be changed." />

      {error !== null && <Callout tone="bad">{error}</Callout>}
      <p role="status" className="text-sm text-muted">
        {message ?? ''}
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          {entities.length === 0 ? (
            <Callout tone="info">Add an entity on the workspace page first.</Callout>
          ) : (
            <>
              <Card>
                <h2 className="font-semibold">Timer</h2>
                {timer !== null && runningSince !== null ? (
                  <div className="mt-3">
                    <p className="text-sm">
                      {timer.engagementTitle !== null
                        ? `Running on ${timer.clientName} · ${timer.engagementTitle}`
                        : `Running on ${timer.clientName}`}
                    </p>
                    <p className="mt-1 text-2xl tabular-nums">{formatElapsed(runningSince, now)}</p>
                    <Button className="mt-3" onClick={() => void stop()}>
                      Stop timer
                    </Button>
                  </div>
                ) : (
                  <form aria-label="Start a timer" noValidate className="mt-3 space-y-3" onSubmit={(e) => void startTimerSubmit(e)}>
                    <Field label="Entity">
                      <select
                        className={inputClass}
                        value={timerClient}
                        onChange={(e) => {
                          setTimerClientId(e.target.value);
                          setTimerEngagement('');
                        }}
                      >
                        {entities.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Engagement">
                      <select className={inputClass} value={timerEngagement} onChange={(e) => setTimerEngagement(e.target.value)}>
                        <option value="">No engagement</option>
                        {timerEngagements.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Note">
                      <input type="text" maxLength={MAX_NOTE_CHARS} className={inputClass} value={timerNote} onChange={(e) => setTimerNote(e.target.value)} />
                    </Field>
                    <label className="mt-3 flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={timerBillable} onChange={(e) => setTimerBillable(e.target.checked)} /> Billable
                    </label>
                    <Button type="submit">Start timer</Button>
                  </form>
                )}
              </Card>

              <Card>
                <h2 className="font-semibold">Add time</h2>
                <form aria-label="Add time" noValidate className="mt-3 space-y-3" onSubmit={(e) => void addSubmit(e)}>
                  <Field label="Entity">
                    <select
                      className={inputClass}
                      value={addClient}
                      onChange={(e) => {
                        setAddClientId(e.target.value);
                        setAddEngagement('');
                      }}
                    >
                      {entities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Engagement">
                    <select className={inputClass} value={addEngagement} onChange={(e) => setAddEngagement(e.target.value)}>
                      <option value="">No engagement</option>
                      {addEngagements.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Date">
                    <input type="date" className={inputClass} value={addDate} onChange={(e) => setAddDate(e.target.value)} />
                  </Field>
                  <Field label="Minutes">
                    <input
                      type="number"
                      min={1}
                      max={MAX_ENTRY_MINUTES}
                      step={1}
                      className={inputClass}
                      value={addMinutes}
                      onChange={(e) => setAddMinutes(e.target.value)}
                    />
                  </Field>
                  <Field label="Note">
                    <input type="text" maxLength={MAX_NOTE_CHARS} className={inputClass} value={addNote} onChange={(e) => setAddNote(e.target.value)} />
                  </Field>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={addBillable} onChange={(e) => setAddBillable(e.target.checked)} /> Billable
                  </label>
                  <Button type="submit">Add entry</Button>
                </form>
              </Card>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setWeek(addDays(weekStart, -7))}>
              Previous week
            </Button>
            <p className="text-sm font-medium">{`Week of ${formatDay(weekStart)}`}</p>
            <Button variant="secondary" onClick={() => setWeek(addDays(weekStart, 7))}>
              Next week
            </Button>
          </div>

          <Card>
            <h2 className="font-semibold">Days</h2>
            <TableScroll>
              <table className="mt-3 w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr>
                    {['Day', 'Time', 'Billable'].map((h) => (
                      <th key={h} scope="col" className="border-b border-line px-2 py-1 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dayTotals(entries, weekStart).map((d, i) => (
                    <tr key={d.day}>
                      <th scope="row" className="border-b border-line px-2 py-1 text-left font-medium">
                        {`${WEEKDAYS[i] ?? ''} ${formatDay(d.day)}`}
                      </th>
                      <td className="border-b border-line px-2 py-1">{formatMinutes(d.minutes)}</td>
                      <td className="border-b border-line px-2 py-1">{formatMinutes(d.billableMinutes)}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="border-b border-line px-2 py-1 text-left font-medium">
                      Total
                    </th>
                    <td className="border-b border-line px-2 py-1">{formatMinutes(totals.minutes)}</td>
                    <td className="border-b border-line px-2 py-1">{formatMinutes(totals.billableMinutes)}</td>
                  </tr>
                </tbody>
              </table>
            </TableScroll>
          </Card>

          <Card>
            <h2 className="font-semibold">Entries</h2>
            <TimeEntryTable entries={entries} showMember={false} onChanged={() => void reload()} />
          </Card>
        </>
      )}
    </div>
  );
}
