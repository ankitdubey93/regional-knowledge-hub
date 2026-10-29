import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CALENDAR_TIMEZONES, formatDay, type CalendarTimezone } from '@chub/shared/utils/deadlines';
import { MAX_WEEKLY_MINUTES, formatLoad, formatMinutes } from '@chub/shared/utils/workload';
import { Button, Callout, Card, Field, inputClass, PageHeader, TableScroll, TextLink } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { getWorkload, setCapacity, setFirmTimezone, type WorkloadView } from '../../lib/workload';

const FULL_BP = 10000; // 100% in basis points

type WorkloadRow = WorkloadView['rows'][number];

const COLUMNS = ['Member', 'Weekly capacity', 'Overdue', 'This week', 'Load this week', 'Next week', 'Load next week', 'No estimate'];

export function WorkloadPage() {
  const [view, setView] = useState<WorkloadView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tz, setTz] = useState<CalendarTimezone>(CALENDAR_TIMEZONES[0]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const next = await getWorkload();
      setView(next);
      setTz(next.timezone ?? CALENDAR_TIMEZONES[0]);
      setDrafts(Object.fromEntries(next.rows.map((r) => [r.userId, String(r.capacityMinutes)])));
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not load the workload');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveTimezone(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await setFirmTimezone(tz);
      setMessage('Firm timezone saved.');
      await load();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not save the firm timezone');
    }
  }

  async function saveCapacity(row: WorkloadRow, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const draft = drafts[row.userId] ?? '';
    if (!/^\d+$/.test(draft) || Number(draft) > MAX_WEEKLY_MINUTES) {
      setError(`Enter whole minutes from 0 to ${MAX_WEEKLY_MINUTES}.`);
      return;
    }
    try {
      await setCapacity(row.userId, Number(draft));
      setMessage(`Capacity saved for ${row.name}.`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not save the capacity');
    }
  }

  const timezoneForm = (
    <form aria-label="Firm timezone form" className="mt-3 space-y-3" onSubmit={(e) => void saveTimezone(e)}>
      <Field label="Firm timezone">
        <select
          className={inputClass}
          value={tz}
          onChange={(e) => {
            const picked = CALENDAR_TIMEZONES.find((z) => z === e.target.value);
            if (picked !== undefined) setTz(picked);
          }}
        >
          {CALENDAR_TIMEZONES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </Field>
      <Button type="submit" className="mt-3">
        Save firm timezone
      </Button>
    </form>
  );

  function renderBody(v: WorkloadView) {
    if (v.timezone === null || v.weekStart === null || v.nextWeekStart === null) {
      if (!v.canEdit) {
        return <Callout tone="info">Ask an owner or admin to set the firm's timezone.</Callout>;
      }
      return (
        <Card>
          <h2 className="font-semibold">Firm timezone</h2>
          <p className="mt-1 text-sm text-muted">Weeks run Monday to Sunday in the firm's timezone. Set it to see the workload.</p>
          {timezoneForm}
        </Card>
      );
    }
    return (
      <>
        <p className="text-sm text-muted">
          {`Weeks run Monday to Sunday in ${v.timezone}. This week starts ${formatDay(v.weekStart)}; next week starts ${formatDay(v.nextWeekStart)}.`}
        </p>

        <Card>
          <h2 className="font-semibold">Members</h2>
          {v.rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No members.</p>
          ) : (
            <TableScroll>
              <table className="mt-3 w-full min-w-[48rem] text-left text-sm">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c} scope="col" className="border-b border-line px-2 py-1 font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {v.rows.map((r) => (
                    <tr key={r.userId}>
                      <th scope="row" className="border-b border-line px-2 py-1 text-left font-medium">
                        {r.name}
                      </th>
                      <td className="border-b border-line px-2 py-1">
                        {`${formatMinutes(r.capacityMinutes)}${r.capacityIsDefault ? ' (default)' : ''}`}
                      </td>
                      <td className="border-b border-line px-2 py-1">{formatMinutes(r.overdueMinutes)}</td>
                      <td className="border-b border-line px-2 py-1">{formatMinutes(r.thisWeek.openMinutes)}</td>
                      <td className="border-b border-line px-2 py-1">
                        {formatLoad(r.thisWeek.loadBp)}
                        {r.thisWeek.loadBp !== null && r.thisWeek.loadBp > FULL_BP && (
                          <span className="ml-2 font-medium text-bad">Over capacity</span>
                        )}
                      </td>
                      <td className="border-b border-line px-2 py-1">{formatMinutes(r.nextWeek.openMinutes)}</td>
                      <td className="border-b border-line px-2 py-1">
                        {formatLoad(r.nextWeek.loadBp)}
                        {r.nextWeek.loadBp !== null && r.nextWeek.loadBp > FULL_BP && (
                          <span className="ml-2 font-medium text-bad">Over capacity</span>
                        )}
                      </td>
                      <td className="border-b border-line px-2 py-1">{String(r.unestimatedCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
          <p className="mt-3 text-sm text-muted">
            Overdue open tasks count towards this week's load. A task with no due date uses its engagement's due date. A task with no
            estimate counts as 0 minutes. Unassigned tasks and tasks in done engagements are not counted. The default capacity is a
            placeholder: set each member's own.
          </p>
        </Card>

        {v.canEdit && (
          <>
            <Card>
              <h2 className="font-semibold">Weekly capacity</h2>
              {v.rows.map((r) => (
                <form
                  key={r.userId}
                  noValidate
                  aria-label={`Capacity for ${r.name}`}
                  className="mt-3 flex flex-wrap items-end gap-2"
                  onSubmit={(e) => void saveCapacity(r, e)}
                >
                  <input
                    type="number"
                    min={0}
                    max={MAX_WEEKLY_MINUTES}
                    step={1}
                    className={inputClass}
                    aria-label={`Weekly capacity in minutes for ${r.name}`}
                    value={drafts[r.userId] ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setDrafts((d) => ({ ...d, [r.userId]: value }));
                    }}
                  />
                  <Button type="submit" aria-label={`Save capacity for ${r.name}`}>
                    Save
                  </Button>
                </form>
              ))}
            </Card>
            <Card>
              <h2 className="font-semibold">Firm timezone</h2>
              {timezoneForm}
            </Card>
          </>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      <TextLink to="/engagements">Back to engagements</TextLink>
      <PageHeader
        title="Workload"
        lead="Open task estimates against each member's weekly capacity, for this week and next. This shows load, not performance."
      />

      {error !== null && <Callout tone="bad">{error}</Callout>}
      {message !== null && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}

      {loading ? <p className="text-sm text-muted">Loading…</p> : view !== null && renderBody(view)}
    </div>
  );
}
