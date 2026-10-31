import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { formatDay } from '@chub/shared/utils/deadlines';
import { ENGAGEMENT_STATUSES, TASK_STATUSES, type EngagementStatus, type TaskStatus } from '@chub/shared/utils/engagements';
import { Button, Callout, Card, Field, inputClass, PageHeader, TableScroll, TextLink } from '../../components/ui';
import { EngagementTime } from '../../components/EngagementTime';
import { ApiError } from '../../lib/api';
import {
  addTask,
  deleteEngagement,
  deleteTask,
  ENGAGEMENT_STATUS_LABELS,
  getEngagement,
  listMembers,
  moveTask,
  TASK_STATUS_LABELS,
  updateEngagement,
  updateTask,
  type EngagementView,
  type MemberView,
  type TaskView,
} from '../../lib/engagements';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; engagement: EngagementView; members: MemberView[] };

type TaskPatch = { status?: TaskStatus; assigneeId?: string | null; dueOn?: string | null; estimateMinutes?: number | null; title?: string };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function EngagementDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    Promise.all([getEngagement(id), listMembers()])
      .then(([detail, members]) => {
        if (cancelled) return;
        setTasks(detail.tasks);
        setState({ status: 'ready', engagement: detail.engagement, members });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'missing' });
        } else {
          setState({ status: 'error', message: errorMessage(err, 'Could not load the engagement') });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function begin() {
    setMessage(null);
    setError(null);
  }

  async function onStatus(status: EngagementStatus) {
    begin();
    try {
      const updated = await updateEngagement(id, { status });
      setState((prev) => (prev.status === 'ready' ? { ...prev, engagement: updated } : prev));
    } catch (err) {
      setError(errorMessage(err, 'Could not update the engagement'));
    }
  }

  async function onDeleteEngagement() {
    if (!window.confirm('Delete this engagement and its tasks?')) return;
    begin();
    try {
      await deleteEngagement(id);
      navigate('/engagements');
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the engagement'));
    }
  }

  async function patchTask(t: TaskView, patch: TaskPatch) {
    begin();
    try {
      const updated = await updateTask(id, t.id, patch);
      setTasks((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(errorMessage(err, 'Could not update the task'));
    }
  }

  async function onMove(t: TaskView, direction: 'up' | 'down') {
    begin();
    try {
      setTasks(await moveTask(id, t.id, direction));
    } catch (err) {
      setError(errorMessage(err, 'Could not move the task'));
    }
  }

  async function onDeleteTask(t: TaskView) {
    if (!window.confirm('Delete this task?')) return;
    begin();
    try {
      await deleteTask(id, t.id);
      setTasks((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the task'));
    }
  }

  function onEstimateBlur(t: TaskView, raw: string) {
    let next: number | null;
    if (raw === '') {
      next = null;
    } else if (!/^\d+$/.test(raw) || Number.parseInt(raw, 10) > 10000) {
      setError('Enter whole minutes from 0 to 10000');
      return;
    } else {
      next = Number.parseInt(raw, 10);
    }
    if (next !== t.estimateMinutes) void patchTask(t, { estimateMinutes: next });
  }

  async function onAddTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    begin();
    try {
      const created = await addTask(id, newTitle);
      setTasks((prev) => [...prev, created]);
      setNewTitle('');
      setMessage('Added.');
    } catch (err) {
      setError(errorMessage(err, 'Could not add the task'));
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="space-y-6">
        <TextLink to="/engagements">Back to engagements</TextLink>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }
  if (state.status === 'missing') {
    return (
      <div className="space-y-6">
        <TextLink to="/engagements">Back to engagements</TextLink>
        <p>Engagement not found.</p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-6">
        <TextLink to="/engagements">Back to engagements</TextLink>
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      </div>
    );
  }

  const { engagement, members } = state;
  return (
    <div className="space-y-6">
      <TextLink to="/engagements">Back to engagements</TextLink>
      <PageHeader title={engagement.title} lead={`${engagement.clientName} · due ${formatDay(engagement.dueOn)}`} />
      <Callout tone="info">Steps from a template are suggested practice, not a legal requirement.</Callout>

      <Card>
        <h2 className="font-semibold">Details</h2>
        <div className="mt-3 space-y-3">
          <Field label="Engagement status">
            <select
              className={inputClass}
              value={engagement.status}
              onChange={(e) => void onStatus(e.target.value as EngagementStatus)}
            >
              {ENGAGEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ENGAGEMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <TextLink to={`/entities/${engagement.clientId}/engagements`}>{`All engagements for ${engagement.clientName}`}</TextLink>
          </div>
          <Button variant="secondary" onClick={() => void onDeleteEngagement()}>
            Delete engagement
          </Button>
        </div>
      </Card>

      {error !== null && <Callout tone="bad">{error}</Callout>}
      {message !== null && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}

      <Card>
        <h2 className="font-semibold">Tasks</h2>
        {tasks.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No tasks yet.</p>
        ) : (
          <TableScroll>
            <table className="mt-3 w-full min-w-[56rem] text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Task</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Assignee</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Due</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Estimate (minutes)</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Status</th>
                  <th scope="col" className="relative border-b border-line px-2 py-1 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={t.id}>
                    <td className="border-b border-line px-2 py-1">{t.title}</td>
                    <td className="border-b border-line px-2 py-1">
                      <select
                        aria-label={`Assignee for ${t.title}`}
                        className={inputClass}
                        value={t.assigneeId ?? ''}
                        onChange={(e) => void patchTask(t, { assigneeId: e.target.value === '' ? null : e.target.value })}
                      >
                        <option value="">Unassigned</option>
                        {members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-line px-2 py-1">
                      <input
                        type="date"
                        aria-label={`Due date for ${t.title}`}
                        className={inputClass}
                        defaultValue={t.dueOn ?? ''}
                        onBlur={(e) => {
                          const v = e.currentTarget.value;
                          if (v !== (t.dueOn ?? '')) void patchTask(t, { dueOn: v === '' ? null : v });
                        }}
                      />
                    </td>
                    <td className="border-b border-line px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        step={1}
                        aria-label={`Estimate in minutes for ${t.title}`}
                        className={inputClass}
                        defaultValue={t.estimateMinutes ?? ''}
                        onBlur={(e) => onEstimateBlur(t, e.currentTarget.value)}
                      />
                    </td>
                    <td className="border-b border-line px-2 py-1">
                      <select
                        aria-label={`Status of ${t.title}`}
                        className={inputClass}
                        value={t.status}
                        onChange={(e) => void patchTask(t, { status: e.target.value as TaskStatus })}
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {TASK_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-line px-2 py-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" aria-label={`Move ${t.title} up`} disabled={i === 0} onClick={() => void onMove(t, 'up')}>
                          Up
                        </Button>
                        <Button
                          variant="secondary"
                          aria-label={`Move ${t.title} down`}
                          disabled={i === tasks.length - 1}
                          onClick={() => void onMove(t, 'down')}
                        >
                          Down
                        </Button>
                        <Button variant="secondary" aria-label={`Delete ${t.title}`} onClick={() => void onDeleteTask(t)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      <Card>
        <form aria-label="Add a task" onSubmit={(e) => void onAddTask(e)}>
          <Field label="Task">
            <input
              type="text"
              required
              maxLength={300}
              className={inputClass}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </Field>
          <Button type="submit" className="mt-3">
            Add task
          </Button>
        </form>
      </Card>

      <EngagementTime engagement={state.engagement} tasks={tasks} />
    </div>
  );
}
