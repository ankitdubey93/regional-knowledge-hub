import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { formatDay } from '@chub/shared/utils/deadlines';
import { Button, Callout, Card, Field, inputClass, PageHeader, TableScroll, TextLink } from '../../components/ui';
import { ApiError, apiJson } from '../../lib/api';
import type { ClientRecord } from '../../lib/entity';
import {
  createEngagement,
  ENGAGEMENT_STATUS_LABELS,
  listClientEngagements,
  listTemplates,
  openEngagements,
  setAutoEngagements,
  type EngagementView,
  type SeedTemplate,
  type TemplateView,
} from '../../lib/engagements';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; client: ClientRecord };

interface TemplateOption {
  value: string;
  label: string;
  name: string;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function optionsFor(client: ClientRecord, seeded: SeedTemplate[], templates: TemplateView[]): TemplateOption[] {
  const suggested = seeded
    .filter((t) => t.jurisdiction === null || client.jurisdiction === 'AU+UK' || t.jurisdiction === client.jurisdiction)
    .map((t) => ({ value: `seed:${t.id}`, label: `${t.name} (suggested)`, name: t.name }));
  const firm = templates.map((t) => ({ value: `firm:${t.id}`, label: t.name, name: t.name }));
  return [...suggested, ...firm];
}

export function EntityEngagements() {
  const { id = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [engagements, setEngagements] = useState<EngagementView[]>([]);
  const [auto, setAuto] = useState(false);
  const [options, setOptions] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    apiJson<{ client: ClientRecord }>(`/clients/${id}`)
      .then(async (body) => {
        const [list, templates] = await Promise.all([listClientEngagements(id), listTemplates()]);
        if (cancelled) return;
        const opts = optionsFor(body.client, templates.seeded, templates.templates);
        setEngagements(list.engagements);
        setAuto(list.autoEngagements);
        setOptions(opts);
        setTemplateId(opts[0]?.value ?? '');
        setTitle(opts[0]?.name ?? '');
        setState({ status: 'ready', client: body.client });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'missing' });
        } else {
          setState({ status: 'error', message: errorMessage(err, 'Could not load the client') });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function begin() {
    setMessage(null);
    setError(null);
    setBusy(true);
  }

  function onTemplateChange(value: string) {
    setTemplateId(value);
    setTitle(options.find((o) => o.value === value)?.name ?? '');
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    begin();
    try {
      const created = await createEngagement(id, { templateId, title, dueOn, periodEnd: periodEnd === '' ? null : periodEnd });
      setEngagements((prev) => [...prev, created]);
      setMessage('Created.');
    } catch (err) {
      setError(errorMessage(err, 'Could not create the engagement'));
    } finally {
      setBusy(false);
    }
  }

  async function onAutoChange(enabled: boolean) {
    setMessage(null);
    setError(null);
    try {
      setAuto(await setAutoEngagements(id, enabled));
    } catch (err) {
      setError(errorMessage(err, 'Could not save the setting'));
    }
  }

  async function onOpen() {
    begin();
    try {
      const out = await openEngagements(id);
      setEngagements(out.engagements);
      setMessage(out.created === 0 ? 'Nothing new to open.' : out.created === 1 ? 'Opened 1 engagement.' : `Opened ${out.created} engagements.`);
    } catch (err) {
      setError(errorMessage(err, 'Could not open the engagements'));
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace">Back to workspace</TextLink>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }
  if (state.status === 'missing') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace">Back to workspace</TextLink>
        <p>Client not found.</p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace">Back to workspace</TextLink>
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      </div>
    );
  }

  const c = state.client;
  return (
    <div className="space-y-6">
      <TextLink to={`/entities/${c.id}`}>{`Back to ${c.name}`}</TextLink>
      <PageHeader title="Engagements" lead={`Recurring work for ${c.name}.`} />

      <Card>
        <h2 className="font-semibold">New engagement</h2>
        <form aria-label="New engagement" className="mt-3" onSubmit={(e) => void onCreate(e)}>
          <div className="space-y-3">
            <Field label="Template">
              <select className={inputClass} value={templateId} onChange={(e) => onTemplateChange(e.target.value)}>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input type="text" required maxLength={200} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Due date">
              <input type="date" required className={inputClass} value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </Field>
            <Field label="Period end (optional)">
              <input type="date" className={inputClass} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" className="mt-3" disabled={busy}>
            Create engagement
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold">From due dates</h2>
        <p className="mt-2 text-sm text-muted">
          BAS, VAT returns and year-end returns in this entity's calendar each get one engagement. Running it again adds only new ones.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => void onAutoChange(e.target.checked)} />
          Open engagements from this entity's due dates
        </label>
        <Button className="mt-3" disabled={busy || !auto} onClick={() => void onOpen()}>
          Open engagements for the next 90 days
        </Button>
      </Card>

      {error !== null && <Callout tone="bad">{error}</Callout>}
      {message !== null && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}

      <Card>
        <h2 className="font-semibold">Engagements</h2>
        {engagements.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No engagements yet.</p>
        ) : (
          <TableScroll>
            <table className="mt-3 w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Due</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Engagement</th>
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
