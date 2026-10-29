import { useEffect, useState } from 'react';
import { formatDay } from '@chub/shared/utils/deadlines';
import { Callout, Card, Field, inputClass, PageHeader, TableScroll, TextLink } from '../../components/ui';
import { ApiError } from '../../lib/api';
import {
  ENGAGEMENT_STATUS_LABELS,
  FILTER_STATUS_OPTIONS,
  listEngagements,
  type EngagementFilterStatus,
  type EngagementView,
} from '../../lib/engagements';

export function EngagementsList() {
  const [status, setStatus] = useState<EngagementFilterStatus>('active');
  const [mine, setMine] = useState(false);
  const [dueBefore, setDueBefore] = useState('');
  const [engagements, setEngagements] = useState<EngagementView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listEngagements({ status, mine, dueBefore: dueBefore === '' ? null : dueBefore })
      .then((rows) => {
        if (!cancelled) setEngagements(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load engagements');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, mine, dueBefore]);

  return (
    <div className="space-y-6">
      <PageHeader title="Engagements" lead="Recurring work across every entity in this firm." />
      <div className="flex flex-wrap gap-4 text-sm">
        <TextLink to="/board">Board</TextLink>
        <TextLink to="/workload">Workload</TextLink>
        <TextLink to="/workspace/templates">Engagement templates</TextLink>
      </div>

      <Card>
        <div className="space-y-3">
          <Field label="Status">
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as EngagementFilterStatus)}>
              {FILTER_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
            Only engagements with tasks assigned to me
          </label>
          <Field label="Due on or before">
            <input type="date" className={inputClass} value={dueBefore} onChange={(e) => setDueBefore(e.target.value)} />
          </Field>
        </div>
      </Card>

      {error !== null && <Callout tone="bad">{error}</Callout>}

      <Card>
        <h2 className="font-semibold">Engagements</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : engagements.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No engagements match. Create one from an entity's Engagements page.</p>
        ) : (
          <TableScroll>
            <table className="mt-3 w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Due</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Engagement</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Entity</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Status</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap border-b border-line px-2 py-1">{formatDay(e.dueOn)}</td>
                    <td className="border-b border-line px-2 py-1">
                      <TextLink to={`/engagements/${e.id}`}>{e.title}</TextLink>
                    </td>
                    <td className="border-b border-line px-2 py-1">
                      <TextLink to={`/entities/${e.clientId}/engagements`}>{e.clientName}</TextLink>
                    </td>
                    <td className="border-b border-line px-2 py-1">{ENGAGEMENT_STATUS_LABELS[e.status]}</td>
                    <td className="border-b border-line px-2 py-1">{`${e.doneCount} of ${e.taskCount} done`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </div>
  );
}
