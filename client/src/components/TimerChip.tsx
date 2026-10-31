import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatElapsed } from '@chub/shared/utils/timesheet';
import { getTimer, notifyTimerChanged, stopTimer, TIMER_CHANGED_EVENT, type TimeEntryView } from '../lib/time';

/** The running timer, shown in the header. Silent on error: it renders nothing rather than a message. */
export function TimerChip() {
  const [timer, setTimer] = useState<TimeEntryView | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const load = useCallback(async () => {
    try {
      setTimer(await getTimer());
    } catch {
      setTimer(null);
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener('focus', load);
    window.addEventListener(TIMER_CHANGED_EVENT, load);
    return () => {
      window.removeEventListener('focus', load);
      window.removeEventListener(TIMER_CHANGED_EVENT, load);
    };
  }, [load]);

  useEffect(() => {
    if (timer === null) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  async function stop() {
    try {
      await stopTimer();
      setTimer(null);
      notifyTimerChanged();
    } catch {
      await load();
    }
  }

  if (timer === null || timer.startedAt === null) return null;

  return (
    <div role="group" aria-label="Running timer" className="flex items-center gap-2 rounded-lg bg-accent-soft px-2 py-1 text-sm">
      <Link to="/time" className="font-medium tabular-nums">
        {formatElapsed(timer.startedAt, now)}
      </Link>
      <span className="max-w-[10rem] truncate text-muted">{timer.clientName}</span>
      <button
        type="button"
        aria-label="Stop the running timer"
        className="rounded px-2 py-1 font-medium hover:bg-panel-2"
        onClick={() => void stop()}
      >
        Stop
      </button>
    </div>
  );
}
