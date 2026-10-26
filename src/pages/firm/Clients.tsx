import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ClientForm } from '../../components/ClientForm';
import { Card, JurisdictionBadge, PageHeader, TextLink } from '../../components/ui';
import { ApiError, apiJson } from '../../lib/api';
import { defaultProfile, profileSummary, type ClientBody, type ClientRecord } from '../../lib/entity';
import { useSessionInfo } from '../../lib/session';

export function Clients() {
  const { session, pending } = useSessionInfo();
  const firmId = session?.activeFirmId ?? null;
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (firmId === null) return;
    let cancelled = false;
    setLoadError(null);
    apiJson<{ clients: ClientRecord[] }>('/clients')
      .then((body) => {
        if (!cancelled) setClients(body.clients);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load clients');
      });
    return () => {
      cancelled = true;
    };
  }, [firmId]);

  async function onAdd(body: ClientBody): Promise<string | null> {
    try {
      const res = await apiJson<{ client: ClientRecord }>('/clients', { method: 'POST', body });
      setClients((rows) => [...rows, res.client].sort((a, b) => a.name.localeCompare(b.name)));
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Could not add the client';
    }
  }

  if (pending) {
    return (
      <div className="space-y-6">
        <PageHeader title="Clients" lead="Group your work under a heading for each client." />
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Clients" lead="Group your work under a heading for each client." />
        <p>Sign in to see your clients.</p>
        <TextLink to="/sign-in">Sign in</TextLink>
      </div>
    );
  }

  if (session.activeFirmId === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Clients" lead="Group your work under a heading for each client." />
        <p>Create a workspace first.</p>
        <TextLink to="/workspace/new">Set up a workspace</TextLink>
      </div>
    );
  }

  if (session.activeWorkspaceKind === 'business') {
    return <Navigate to="/business" replace />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Clients" lead="Group your work under a heading for each client." />
      <Card>
        <ClientForm
          initial={{ name: '', notes: '', profile: defaultProfile('AU') }}
          nameLabel="Client name"
          submitLabel="Add client"
          resetOnSuccess
          onSubmit={onAdd}
        />
      </Card>
      {loadError !== null && (
        <p role="alert" className="text-sm text-bad">
          {loadError}
        </p>
      )}
      {clients.length === 0 ? (
        <p className="text-muted">No clients yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {clients.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
              <JurisdictionBadge j={c.jurisdiction} />
              <Link to={`/clients/${c.id}`} className="font-medium text-accent underline underline-offset-2">
                {c.name}
              </Link>
              <span className="text-sm text-muted">{profileSummary(c)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
