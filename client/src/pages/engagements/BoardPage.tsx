import { useEffect, useRef, useState } from 'react';
import { formatDay } from '@chub/shared/utils/deadlines';
import { ENGAGEMENT_STATUSES, type EngagementStatus } from '@chub/shared/utils/engagements';
import { Button, Callout, Card, inputClass, PageHeader, TextLink } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { ENGAGEMENT_STATUS_LABELS, listEngagements, updateEngagement, type EngagementView } from '../../lib/engagements';

/** The three columns of the board. Done engagements leave the board (find them on Engagements, Done filter). */
const BOARD_STATUSES = ['planned', 'in_progress', 'review'] as const;

export function BoardPage() {
  const [mine, setMine] = useState(false);
  const [engagements, setEngagements] = useState<EngagementView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const selectRefs = useRef(new Map<string, HTMLSelectElement>());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listEngagements({ status: 'active', mine, dueBefore: null })
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
  }, [mine]);

  useEffect(() => {
    if (focusId === null) return;
    selectRefs.current.get(focusId)?.focus();
    setFocusId(null);
  }, [focusId, engagements]);

  async function move(e: EngagementView, to: EngagementStatus) {
    setError(null);
    try {
      const updated = await updateEngagement(e.id, { status: to });
      if (to === 'done') {
        setEngagements((list) => list.filter((x) => x.id !== e.id));
      } else {
        setEngagements((list) => list.map((x) => (x.id === e.id ? updated : x)));
        setFocusId(e.id);
      }
      setMessage(`${e.title} moved to ${ENGAGEMENT_STATUS_LABELS[to]}.`);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Could not move the engagement');
    }
  }

  return (
    <div className="space-y-6">
      <TextLink to="/engagements">Back to engagements</TextLink>
      <PageHeader
        title="Board"
        lead="Active engagements by status. Move a card with its status list or its Move buttons. Done engagements leave the board; find them on Engagements with the Done filter."
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
        Only engagements with tasks assigned to me
      </label>

      {error !== null && <Callout tone="bad">{error}</Callout>}
      {message !== null && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {BOARD_STATUSES.map((status) => {
            const label = ENGAGEMENT_STATUS_LABELS[status];
            const cards = engagements.filter((e) => e.status === status);
            return (
              <section key={status} aria-label={label} className="min-w-0 space-y-3">
                <h2 className="font-semibold">{`${label} (${cards.length})`}</h2>
                {cards.length === 0 ? (
                  <p className="text-sm text-muted">No engagements.</p>
                ) : (
                  <ul className="space-y-3">
                    {cards.map((e) => {
                      const index = ENGAGEMENT_STATUSES.indexOf(e.status);
                      const left = index > 0 ? (ENGAGEMENT_STATUSES[index - 1] ?? null) : null;
                      const right = index < ENGAGEMENT_STATUSES.length - 1 ? (ENGAGEMENT_STATUSES[index + 1] ?? null) : null;
                      return (
                        <li key={e.id}>
                          <Card>
                            <TextLink to={`/engagements/${e.id}`}>{e.title}</TextLink>
                            <p className="mt-1 text-sm text-muted">{`${e.clientName} · due ${formatDay(e.dueOn)}`}</p>
                            <p className="text-sm text-muted">{`${e.doneCount} of ${e.taskCount} tasks done`}</p>
                            <select
                              aria-label={`Status of ${e.title}`}
                              className={`${inputClass} mt-2`}
                              value={e.status}
                              ref={(el) => {
                                if (el) selectRefs.current.set(e.id, el);
                                else selectRefs.current.delete(e.id);
                              }}
                              onChange={(ev) => void move(e, ev.target.value as EngagementStatus)}
                            >
                              {ENGAGEMENT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {ENGAGEMENT_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                variant="secondary"
                                aria-label={`Move ${e.title} left`}
                                disabled={left === null}
                                onClick={() => {
                                  if (left !== null) void move(e, left);
                                }}
                              >
                                Move left
                              </Button>
                              <Button
                                variant="secondary"
                                aria-label={`Move ${e.title} right`}
                                onClick={() => {
                                  if (right !== null) void move(e, right);
                                }}
                              >
                                Move right
                              </Button>
                            </div>
                          </Card>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
