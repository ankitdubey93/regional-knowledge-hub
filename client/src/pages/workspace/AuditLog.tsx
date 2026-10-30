import { useEffect, useState, type FormEvent } from 'react';
import { Button, Callout, Card, Field, PageHeader, TableScroll, TextLink, inputClass } from '../../components/ui';
import { ApiError } from '../../lib/api';
import {
  ACTION_LABELS,
  TARGET_LABELS,
  getRetention,
  listAuditEvents,
  setRetention,
  type AuditEvent,
  type RetentionSettings,
} from '../../lib/audit';

function toInput(n: number | null): string {
  return n === null ? '' : String(n);
}

function fromInput(value: string): number | null {
  return value === '' ? null : Number(value);
}

function daysLabel(n: number | null): string {
  return n === null ? 'Kept forever' : `${n} days`;
}

export function AuditLog() {
  const [saved, setSaved] = useState<RetentionSettings>({ documentsDays: null, conversationsDays: null });
  const [canEdit, setCanEdit] = useState(false);
  const [retLoading, setRetLoading] = useState(true);
  const [retError, setRetError] = useState<string | null>(null);
  const [docDays, setDocDays] = useState('');
  const [convDays, setConvDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [actLoading, setActLoading] = useState(true);
  const [actError, setActError] = useState<string | null>(null);
  const [olderBusy, setOlderBusy] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRetention()
      .then((view) => {
        if (cancelled) return;
        setSaved(view.retention);
        setDocDays(toInput(view.retention.documentsDays));
        setConvDays(toInput(view.retention.conversationsDays));
        setCanEdit(view.canEdit);
      })
      .catch((err: unknown) => {
        if (!cancelled) setRetError(err instanceof ApiError ? err.message : 'Could not load retention');
      })
      .finally(() => {
        if (!cancelled) setRetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    listAuditEvents(null)
      .then((page) => {
        if (cancelled) return;
        setEvents(page.events);
        setNextBefore(page.nextBefore);
      })
      .catch((err: unknown) => {
        if (!cancelled) setActError(err instanceof ApiError ? err.message : 'Could not load the audit log');
      })
      .finally(() => {
        if (!cancelled) setActLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaveNotice(null);
    setSaveError(null);
    try {
      const next = await setRetention({ documentsDays: fromInput(docDays), conversationsDays: fromInput(convDays) });
      setSaved(next);
      setDocDays(toInput(next.documentsDays));
      setConvDays(toInput(next.conversationsDays));
      setSaveNotice('Retention saved.');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save retention');
    } finally {
      setSaving(false);
    }
  }

  async function onLoadOlder() {
    if (nextBefore === null) return;
    setOlderBusy(true);
    setOlderError(null);
    try {
      const page = await listAuditEvents(nextBefore);
      setEvents((prev) => [...prev, ...page.events]);
      setNextBefore(page.nextBefore);
    } catch (err) {
      setOlderError(err instanceof ApiError ? err.message : 'Could not load older events');
    } finally {
      setOlderBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <TextLink to="/workspace">Back to workspace</TextLink>
      <PageHeader title="Audit log" />

      <Card>
        <h2 className="font-semibold">Retention</h2>
        <p className="mt-1 text-sm text-muted">
          Documents are purged by upload date and conversations by their last message, once a day. Purged records cannot be
          recovered. Leave a box empty to keep forever.
        </p>
        {retLoading ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : retError !== null ? (
          <div className="mt-3">
            <Callout tone="bad">{retError}</Callout>
          </div>
        ) : canEdit ? (
          <form aria-label="Retention" onSubmit={onSave} className="mt-3 space-y-3">
            <Field label="Keep documents for (days)">
              <input
                type="number"
                min={30}
                max={3650}
                step={1}
                inputMode="numeric"
                placeholder="Keep forever"
                className={inputClass}
                value={docDays}
                onChange={(e) => setDocDays(e.target.value)}
              />
            </Field>
            <Field label="Keep conversations for (days)">
              <input
                type="number"
                min={30}
                max={3650}
                step={1}
                inputMode="numeric"
                placeholder="Keep forever"
                className={inputClass}
                value={convDays}
                onChange={(e) => setConvDays(e.target.value)}
              />
            </Field>
            {saveNotice !== null && <p role="status">{saveNotice}</p>}
            {saveError !== null && (
              <p role="alert" className="text-sm text-bad">
                {saveError}
              </p>
            )}
            <Button type="submit" disabled={saving}>
              Save retention
            </Button>
          </form>
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt>Documents</dt>
              <dd>{daysLabel(saved.documentsDays)}</dd>
              <dt>Conversations</dt>
              <dd>{daysLabel(saved.conversationsDays)}</dd>
            </dl>
            <p className="mt-2 text-sm text-muted">Only the workspace owner can change retention.</p>
          </>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Activity</h2>
        {actLoading ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : actError !== null ? (
          <div className="mt-3">
            <Callout tone="info">{actError}</Callout>
          </div>
        ) : events.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No activity yet.</p>
        ) : (
          <>
            <TableScroll>
              <table className="mt-3 w-full min-w-[40rem] text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      When
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Who
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Action
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-t border-line">
                      <td className="py-2 pr-4">
                        {new Date(e.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="py-2 pr-4">{e.actorName ?? (e.actorId === null ? 'System' : 'Former member')}</td>
                      <td className="py-2 pr-4">{ACTION_LABELS[e.action]}</td>
                      <td className="py-2">
                        {e.action === 'retention.purge'
                          ? `Documents: ${String(e.detail.documents ?? 0)}, conversations: ${String(e.detail.conversations ?? 0)}`
                          : `${TARGET_LABELS[e.targetType]} ${e.targetId.slice(0, 8)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            {olderError !== null && (
              <div className="mt-3">
                <Callout tone="info">{olderError}</Callout>
              </div>
            )}
            {nextBefore !== null && (
              <div className="mt-3">
                <Button variant="secondary" onClick={onLoadOlder} disabled={olderBusy}>
                  Load older
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
