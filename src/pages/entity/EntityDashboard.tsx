import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChatPanel } from '../../components/ChatPanel';
import { Card, JurisdictionBadge, PageHeader, TextLink } from '../../components/ui';
import { docs } from '../../content/docs';
import { setActiveEntity } from '../../lib/activeEntity';
import { ApiError, apiJson } from '../../lib/api';
import { entitySuggestions } from '../../lib/chat';
import { MONTHS, TAX_PERIODS, entityTypeLabel, profileSummary, taxLabel, type ClientRecord } from '../../lib/entity';
import { useSessionInfo } from '../../lib/session';

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
  return (
    <>
      <PageHeader title={c.name} lead={summary}>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <JurisdictionBadge j={c.jurisdiction} />
          <TextLink to={`/entities/${c.id}/settings`}>Edit details</TextLink>
        </div>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <ChatPanel
            title={`Ask anything about ${c.name}`}
            lead="Questions about this entity's tax, bookkeeping and deadlines."
            {...(summary === '' ? {} : { contextLine: `Profile: ${summary}` })}
            placeholder={`Ask about ${c.name}`}
            suggestions={entitySuggestions(c.jurisdiction)}
          />
        </div>
        <aside className="space-y-4">
          <Card>
            <h2 className="font-semibold">Profile</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-muted">Jurisdiction</dt>
                <dd>{{ AU: 'Australia', UK: 'UK', 'AU+UK': 'Australia and the UK' }[c.jurisdiction]}</dd>
              </div>
              <div>
                <dt className="text-muted">Entity type</dt>
                <dd>{c.entityType === null ? 'Not set' : entityTypeLabel(c.entityType, c.jurisdiction)}</dd>
              </div>
              <div>
                <dt className="text-muted">{`${taxLabel(c.jurisdiction)} registration`}</dt>
                <dd>{registrationText(c)}</dd>
              </div>
              <div>
                <dt className="text-muted">Year end</dt>
                <dd>{c.fyEndMonth === null ? 'Not set' : MONTHS[c.fyEndMonth - 1]}</dd>
              </div>
            </dl>
          </Card>
          <Card>
            <h2 className="font-semibold">In the Knowledge Hub</h2>
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
      <TextLink to="/workspace">Back to workspace</TextLink>
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
