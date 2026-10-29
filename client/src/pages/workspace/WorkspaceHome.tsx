import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { ClientForm } from '../../components/ClientForm';
import { DueSoon } from '../../components/DueSoon';
import { Card, JurisdictionBadge, PageHeader, TextLink } from '../../components/ui';
import { ApiError, apiJson } from '../../lib/api';
import { defaultProfile, profileSummary, type ClientBody, type ClientRecord } from '../../lib/entity';
import { useSessionInfo } from '../../lib/session';

const TILE = 'block h-full rounded-xl border border-line bg-panel p-5 hover:border-accent';

const NEW_WORKSPACE_TILES = [
  { to: '/workspace/new?kind=business', title: 'My own business', text: 'Keep your own books and ask about your business.' },
  { to: '/workspace/new?kind=practice', title: 'An accounting or bookkeeping practice', text: 'Add a tile for each client you look after.' },
];

function KnowledgeHubCard() {
  return (
    <Card>
      <h2 className="text-lg font-semibold">Knowledge Hub</h2>
      <p className="mt-1 text-sm text-muted">
        Guides, calculators and practice for Australia and the UK. Open an entity first and the hub shows only what applies to it.
      </p>
      <div className="mt-3">
        <TextLink to="/knowledge">Open the Knowledge Hub</TextLink>
      </div>
    </Card>
  );
}

export function WorkspaceHome() {
  const { session, pending } = useSessionInfo();
  const firmId = session?.activeFirmId ?? null;
  const [clients, setClients] = useState<ClientRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (firmId === null) return;
    let cancelled = false;
    setLoadError(null);
    apiJson<{ clients: ClientRecord[] }>('/clients')
      .then((body) => {
        if (!cancelled) setClients(body.clients);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load your workspace');
      });
    return () => {
      cancelled = true;
    };
  }, [firmId]);

  if (pending) {
    return (
      <div className="space-y-6">
        <PageHeader title="Workspace" />
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Workspace" />
        <p>Sign in to see your workspace.</p>
        <TextLink to="/sign-in">Sign in</TextLink>
      </div>
    );
  }

  const firstName = session.name.trim().split(/\s+/)[0] || session.name;

  if (session.activeFirmId === null) {
    return (
      <div className="space-y-8">
        <PageHeader title={`Welcome, ${firstName}`} lead="Set up a workspace to get started." />
        <div>
          <h2 className="mb-4 text-xl font-semibold">What will you use Compliance Hub for?</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {NEW_WORKSPACE_TILES.map((t) => (
              <li key={t.to}>
                <Link to={t.to} className={TILE}>
                  <p className="font-semibold">{t.title}</p>
                  <p className="mt-1 text-sm text-muted">{t.text}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <KnowledgeHubCard />
      </div>
    );
  }

  const isBusiness = session.activeWorkspaceKind === 'business';

  async function onCreate(body: ClientBody): Promise<string | null> {
    try {
      const res = await apiJson<{ client: ClientRecord }>('/clients', { method: 'POST', body });
      setClients([res.client]);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Could not save the business';
    }
  }

  async function onAdd(body: ClientBody): Promise<string | null> {
    try {
      const res = await apiJson<{ client: ClientRecord }>('/clients', { method: 'POST', body });
      setClients((rows) => [...(rows ?? []), res.client].sort((a, b) => a.name.localeCompare(b.name)));
      setAdding(false);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Could not add the client';
    }
  }

  let main: ReactNode;
  if (loadError !== null) {
    main = (
      <p role="alert" className="text-sm text-bad">
        {loadError}
      </p>
    );
  } else if (clients === null) {
    main = <p className="text-muted">Loading…</p>;
  } else if (isBusiness && clients.length === 0) {
    main = (
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Set up your business</h2>
        <ClientForm
          initial={{ name: session.activeFirmName ?? '', notes: '', profile: defaultProfile('AU') }}
          nameLabel="Business name"
          submitLabel="Save"
          onSubmit={onCreate}
        />
      </Card>
    );
  } else {
    main = (
      <div>
        <DueSoon clients={clients} />
        <p className="mb-6 flex flex-wrap gap-4 text-sm">
          <TextLink to="/engagements">Engagements</TextLink>
          <TextLink to="/workspace/templates">Engagement templates</TextLink>
        </p>
        <h2 className="mb-4 text-xl font-semibold">{isBusiness ? 'Your business' : 'Clients'}</h2>
        {!isBusiness && clients.length === 0 && (
          <p className="mb-4 text-muted">No clients yet. Add your first client to get a dashboard for it.</p>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <li key={c.id}>
              <Link to={`/entities/${c.id}`} className={TILE}>
                <JurisdictionBadge j={c.jurisdiction} />
                <p className="mt-2 font-semibold">{c.name}</p>
                <p className="mt-1 text-sm text-muted">{profileSummary(c)}</p>
              </Link>
            </li>
          ))}
          {!isBusiness && (
            <li>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex h-full min-h-24 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line p-5 font-medium text-accent hover:border-accent"
              >
                <Plus size={18} aria-hidden />
                New client
              </button>
            </li>
          )}
        </ul>
        {adding && (
          <Card className="mt-4">
            <h2 className="mb-4 text-lg font-semibold">New client</h2>
            <ClientForm
              initial={{ name: '', notes: '', profile: defaultProfile('AU') }}
              nameLabel="Client name"
              submitLabel="Add client"
              resetOnSuccess
              onSubmit={onAdd}
            />
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome, ${firstName}`}
        lead={`${session.activeFirmName ?? ''} · ${isBusiness ? 'Business' : 'Practice'} workspace`}
      />
      {main}
      <KnowledgeHubCard />
    </div>
  );
}
