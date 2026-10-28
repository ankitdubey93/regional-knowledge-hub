import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Callout, Card, Field, PageHeader, TableScroll, TextLink, inputClass } from '../../components/ui';
import { fact, type FactStatus } from '../../data/facts';
import { calendarProfile, calendarRules, entityToday, obligationStatus } from '../../lib/calendar';
import { ApiError, apiJson } from '../../lib/api';
import { MONTHS, type ClientRecord } from '../../lib/entity';
import { toIcs } from '../../utils/ics';
import {
  CALENDAR_TIMEZONES,
  addDays,
  calendarNotes,
  daysBetween,
  defaultTimezone,
  formatDay,
  obligationsFor,
} from '@chub/shared/utils/deadlines';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; client: ClientRecord };

const linkClass = 'font-medium text-accent underline underline-offset-2 hover:text-accent-hover';

const RULE_TEXT: Record<FactStatus, string> = {
  verified: 'Checked',
  stale: 'Checked over a year ago',
  unverified: 'Not checked',
};

function whenText(today: string, dueDate: string): string {
  const n = daysBetween(today, dueDate);
  if (n < 0) return 'Past';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${n} days`;
}

function CalendarView({ c, onSaved }: { c: ClientRecord; onSaved: (client: ClientRecord) => void }) {
  const profile = calendarProfile(c);
  const notes = calendarNotes(profile);
  const today = entityToday(c, new Date());
  const obligations = obligationsFor(profile, calendarRules(), addDays(today, -30), addDays(today, 365));

  const [timezone, setTimezone] = useState<string>(c.timezone ?? defaultTimezone(c.jurisdiction));
  const [registeredOn, setRegisteredOn] = useState<string>(c.registeredOn ?? '');
  const [vatStaggerMonth, setVatStaggerMonth] = useState<number | null>(c.vatStaggerMonth);
  const [mtdItsa, setMtdItsa] = useState<boolean>(c.mtdItsa);
  const [message, setMessage] = useState<{ kind: 'status' | 'alert'; text: string } | null>(null);

  function download() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const blob = new Blob([toIcs(c.name, obligations, stamp)], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${c.name} calendar.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    try {
      const res = await apiJson<{ client: ClientRecord }>(`/clients/${c.id}`, {
        method: 'PATCH',
        body: {
          timezone,
          registeredOn: registeredOn === '' ? null : registeredOn,
          vatStaggerMonth,
          mtdItsa,
        },
      });
      onSaved(res.client);
      setMessage({ kind: 'status', text: 'Saved.' });
    } catch (err) {
      setMessage({ kind: 'alert', text: err instanceof ApiError ? err.message : 'Could not save the calendar details' });
    }
  }

  return (
    <>
      <PageHeader title="Calendar" lead={`${c.name}: due dates worked out from its profile.`} />
      <Callout tone="warn">
        <p className="font-medium">What this calendar does not show</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Callout>
      <Card className="mt-6">
        <h2 className="font-semibold">Due dates</h2>
        {obligations.length === 0 ? (
          <p className="mt-3">No due dates in this window for this profile.</p>
        ) : (
          <>
            <div className="mt-3">
              <TableScroll>
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Due
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        What
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        When
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        Rule
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {obligations.map((o) => (
                      <tr key={o.id} className="border-b border-line align-top">
                        <td className="whitespace-nowrap py-2 pr-4">{formatDay(o.dueDate)}</td>
                        <td className="py-2 pr-4">
                          {o.label}
                          {o.caveat && <span className="block text-xs text-muted">{o.caveat}</span>}
                        </td>
                        <td className="whitespace-nowrap py-2 pr-4">{whenText(today, o.dueDate)}</td>
                        <td className="py-2">
                          <a href={fact(o.factKeys[0]!).source} target="_blank" rel="noreferrer" className={linkClass}>
                            {RULE_TEXT[obligationStatus(o, today)]}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          </>
        )}
        <div className="mt-4">
          <Button type="button" onClick={download}>
            Download calendar (.ics)
          </Button>
        </div>
      </Card>
      <Card className="mt-6">
        <h2 className="font-semibold">Calendar details</h2>
        <form className="mt-4 space-y-4" onSubmit={onSave}>
          <Field label="Timezone">
            <select className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {CALENDAR_TIMEZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date of incorporation or registration">
            <input type="date" className={inputClass} value={registeredOn} onChange={(e) => setRegisteredOn(e.target.value)} />
          </Field>
          {c.jurisdiction === 'UK' && c.taxRegistered && c.taxPeriod === 'quarterly' && (
            <Field label="VAT quarter ends in">
              <select
                className={inputClass}
                value={vatStaggerMonth === null ? '' : String(vatStaggerMonth)}
                onChange={(e) => setVatStaggerMonth(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">Not set</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {c.jurisdiction === 'UK' && c.entityType === 'sole_trader' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={mtdItsa} onChange={(e) => setMtdItsa(e.target.checked)} />
              Uses Making Tax Digital for Income Tax
            </label>
          )}
          <Button type="submit">Save calendar details</Button>
          {message !== null &&
            (message.kind === 'status' ? (
              <p role="status" className="text-sm">
                {message.text}
              </p>
            ) : (
              <p role="alert" className="text-sm text-bad">
                {message.text}
              </p>
            ))}
        </form>
      </Card>
    </>
  );
}

export function EntityCalendar() {
  const { id = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    apiJson<{ client: ClientRecord }>(`/clients/${id}`)
      .then((body) => {
        if (!cancelled) setState({ status: 'ready', client: body.client });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'missing' });
        } else {
          setState({ status: 'error', message: err instanceof ApiError ? err.message : 'Could not load the client' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="space-y-6">
      <TextLink to={`/entities/${id}`}>Back to dashboard</TextLink>
      {state.status === 'loading' && <p className="text-muted">Loading…</p>}
      {state.status === 'missing' && <p>Client not found.</p>}
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && <CalendarView c={state.client} onSaved={(client) => setState({ status: 'ready', client })} />}
    </div>
  );
}
