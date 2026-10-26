import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ClientForm } from '../../components/ClientForm';
import { Card, PageHeader, TextLink } from '../../components/ui';
import { ApiError, apiJson } from '../../lib/api';
import { defaultProfile, profileOf, profileSummary, type ClientBody, type ClientRecord } from '../../lib/entity';
import { useSessionInfo } from '../../lib/session';

export function Business() {
  const { session, pending } = useSessionInfo();
  const firmId = session?.activeFirmId ?? null;
  const [clients, setClients] = useState<ClientRecord[] | null>(null);
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
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load your business');
      });
    return () => {
      cancelled = true;
    };
  }, [firmId]);

  if (pending) {
    return (
      <div className="space-y-6">
        <PageHeader title="Your business" />
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Your business" />
        <p>Sign in to see your business.</p>
        <TextLink to="/sign-in">Sign in</TextLink>
      </div>
    );
  }

  if (session.activeFirmId === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Your business" />
        <p>Create a workspace first.</p>
        <TextLink to="/workspace/new">Set up a workspace</TextLink>
      </div>
    );
  }

  if (session.activeWorkspaceKind === 'practice') {
    return <Navigate to="/clients" replace />;
  }

  if (loadError !== null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Your business" />
        <p role="alert" className="text-sm text-bad">
          {loadError}
        </p>
      </div>
    );
  }

  if (clients === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Your business" />
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  const entity = clients[0];

  if (entity === undefined) {
    async function onCreate(body: ClientBody): Promise<string | null> {
      try {
        const res = await apiJson<{ client: ClientRecord }>('/clients', { method: 'POST', body });
        setClients([res.client]);
        return null;
      } catch (err) {
        return err instanceof ApiError ? err.message : 'Could not save the business';
      }
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Set up your business" />
        <Card>
          <ClientForm
            initial={{ name: session.activeFirmName ?? '', notes: '', profile: defaultProfile('AU') }}
            nameLabel="Business name"
            submitLabel="Save"
            onSubmit={onCreate}
          />
        </Card>
      </div>
    );
  }

  const onSave = async (body: ClientBody): Promise<string | null> => {
    try {
      const res = await apiJson<{ client: ClientRecord }>(`/clients/${entity.id}`, { method: 'PATCH', body });
      setClients([res.client]);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Could not save the business';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={entity.name} lead={profileSummary(entity)} />
      <Card>
        <ClientForm
          initial={{ name: entity.name, notes: entity.notes, profile: profileOf(entity) }}
          nameLabel="Business name"
          submitLabel="Save changes"
          onSubmit={onSave}
        />
      </Card>
    </div>
  );
}
