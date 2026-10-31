import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, LineChart, Upload } from 'lucide-react';
import { ChatPanel } from '../../components/ChatPanel';
import { EntityHeader } from '../../components/EntityHeader';
import { Card, TextLink } from '../../components/ui';
import { docs } from '../../content/docs';
import { setActiveEntity } from '../../lib/activeEntity';
import { ApiError, apiJson } from '../../lib/api';
import { nextDue } from '../../lib/calendar';
import { entitySuggestions } from '../../lib/chat';
import { MONTHS, TAX_PERIODS, entityTypeLabel, profileSummary, taxLabel, type ClientRecord } from '../../lib/entity';
import { useSessionInfo } from '../../lib/session';
import { formatDay } from '@chub/shared/utils/deadlines';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; client: ClientRecord };

function registrationText(c: ClientRecord): string {
  if (c.taxRegistered && c.taxPeriod) {
    return `Registered, ${TAX_PERIODS.find((p) => p.value === c.taxPeriod)!.label.toLowerCase()}`;
  }
  return c.taxRegistered ? 'Registered' : 'Not registered';
}

function EntityView({ c }: { c: ClientRecord }) {
  const summary = profileSummary(c);
  const sections: string[] = c.jurisdiction === 'AU' ? ['australia'] : c.jurisdiction === 'UK' ? ['uk'] : ['australia', 'uk'];
  const topics = docs.filter((d) => sections.includes(d.section)).slice(0, 4);
  const next = nextDue(c, new Date());
  const glance = [
    {
      to: `/entities/${c.id}/calendar`,
      icon: CalendarDays,
      title: next === null ? 'No due dates yet' : next.label,
      sub: next === null ? 'Set the calendar details to see them' : `Due ${formatDay(next.dueDate)}`,
      named: false,
    },
    { to: `/entities/${c.id}/books`, icon: Upload, title: 'Import a trial balance', sub: 'CSV or Excel, from Xero and others', named: true },
    { to: `/entities/${c.id}/reports`, icon: LineChart, title: 'View reports', sub: 'Profit and loss and balance sheet', named: true },
  ];
  return (
    <>
      <EntityHeader client={c} overview />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <ChatPanel
            title={`Ask anything about ${c.name}`}
            lead="Questions about this entity's tax, bookkeeping and deadlines."
            {...(summary === '' ? {} : { contextLine: `Profile: ${summary}` })}
            placeholder={`Ask about ${c.name}`}
            suggestions={entitySuggestions(c.jurisdiction)}
            clientId={c.id}
            scope={null}
          />
        </div>
        <aside className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold tracking-tight">At a glance</h2>
            <ul className="mt-3 grid gap-0.5">
              {glance.map(({ to, icon: Icon, title, sub, named }) => (
                <li key={title}>
                  <Link
                    to={to}
                    aria-label={named ? title : `${title}, ${sub}`}
                    className="group -mx-2.5 grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors duration-150 ease-snappy hover:bg-panel-2"
                  >
                    <span className="inline-flex size-[34px] items-center justify-center rounded-[10px] bg-sun-soft text-sun" aria-hidden>
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{title}</span>
                      <span className="block text-[13px] text-muted">{sub}</span>
                    </span>
                    <ArrowRight
                      size={16}
                      aria-hidden
                      className="text-muted transition-transform duration-150 ease-snappy group-hover:translate-x-0.5 motion-reduce:transform-none"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Jurisdiction</dt>
              <dd className="text-right font-semibold">{{ AU: 'Australia', UK: 'UK', 'AU+UK': 'Australia and the UK' }[c.jurisdiction]}</dd>
              <dt className="text-muted">Entity type</dt>
              <dd className="text-right font-semibold">{c.entityType === null ? 'Not set' : entityTypeLabel(c.entityType, c.jurisdiction)}</dd>
              <dt className="text-muted">{`${taxLabel(c.jurisdiction)} registration`}</dt>
              <dd className="text-right font-semibold">{registrationText(c)}</dd>
              <dt className="text-muted">Year end</dt>
              <dd className="text-right font-semibold">{c.fyEndMonth === null ? 'Not set' : MONTHS[c.fyEndMonth - 1]}</dd>
            </dl>
            <div className="mt-4">
              <TextLink to={`/entities/${c.id}/settings`}>Edit details</TextLink>
            </div>
          </Card>
          <Card className="bg-sun-soft shadow-none">
            <h2 className="text-lg font-semibold tracking-tight">In the Knowledge Hub</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {topics.map((d) => (
                <li key={d.id}>
                  <TextLink to={`/knowledge/learn/${d.id}`}>{d.title}</TextLink>
                </li>
              ))}
              <li>
                <TextLink to="/knowledge/tools/tax">Tax calculator</TextLink>
              </li>
              <li>
                <TextLink to="/knowledge">Open the Knowledge Hub</TextLink>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}

export function EntityDashboard() {
  const { id = '' } = useParams();
  const { session } = useSessionInfo();
  const firmId = session?.activeFirmId ?? null;
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

  useEffect(() => {
    if (state.status === 'ready' && firmId !== null) {
      setActiveEntity({
        workspaceId: firmId,
        id: state.client.id,
        name: state.client.name,
        jurisdiction: state.client.jurisdiction,
      });
    }
  }, [state, firmId]);

  return (
    <div className="space-y-6">
      {state.status !== 'ready' && <TextLink to="/workspace">Back to workspace</TextLink>}
      {state.status === 'loading' && <p className="text-muted">Loading…</p>}
      {state.status === 'missing' && <p>Client not found.</p>}
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && <EntityView c={state.client} />}
    </div>
  );
}
