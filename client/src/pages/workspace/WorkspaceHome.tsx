import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LayoutList, ListChecks, Plus, Search, ShieldCheck, Users } from 'lucide-react';
import { ClientForm } from '../../components/ClientForm';
import { DueSoon } from '../../components/DueSoon';
import { Button, Card, JurisdictionBadge, PageHeader, TextLink, cardLinkClass, cx, inputClass } from '../../components/ui';
import { ApiError, apiJson } from '../../lib/api';
import { dueWithin, nextDue } from '../../lib/calendar';
import { defaultProfile, profileSummary, type ClientBody, type ClientRecord } from '../../lib/entity';
import { useSessionInfo } from '../../lib/session';
import { formatDay } from '@chub/shared/utils/deadlines';

const NEW_WORKSPACE_TILES = [
  {
    to: '/workspace/new?kind=business',
    title: 'My own business',
    text: 'Keep your own books and ask about your business.',
  },
  {
    to: '/workspace/new?kind=practice',
    title: 'An accounting or bookkeeping practice',
    text: 'Add a tile for each client you look after.',
  },
];

const WORKSPACE_LINKS = [
  { to: '/engagements', label: 'Engagements', icon: LayoutList },
  {
    to: '/workspace/templates',
    label: 'Engagement templates',
    icon: ListChecks,
  },
  { to: '/workspace/members', label: 'Members', icon: Users },
  { to: '/workspace/audit', label: 'Audit log', icon: ShieldCheck },
];

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function KnowledgeHubCard({ tinted = false }: { tinted?: boolean }) {
  return (
    <Card className={cx(tinted && 'bg-sun-soft shadow-none')}>
      <h2 className="text-xl font-semibold tracking-tight">Knowledge Hub</h2>
      <p className={cx('mt-1 text-sm', tinted ? 'text-ink' : 'text-muted')}>
        Guides, calculators and practice for Australia and the UK. Open an entity first and the hub shows only what applies to it.
      </p>
      <div className="mt-3">
        <TextLink to="/knowledge">Open the Knowledge Hub</TextLink>
      </div>
    </Card>
  );
}

function WorkspaceLinks({ title }: { title: string }) {
  return (
    <Card>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <ul className="mt-2 grid gap-0.5">
        {WORKSPACE_LINKS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="group -mx-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors duration-150 ease-snappy hover:bg-accent-soft hover:text-accent"
            >
              <span className="inline-flex size-8 items-center justify-center rounded-[10px] bg-panel-2 text-muted" aria-hidden>
                <Icon size={16} />
              </span>
              {label}
              <ArrowRight
                size={16}
                aria-hidden
                className="ml-auto text-muted transition-transform duration-150 ease-snappy group-hover:translate-x-0.5 motion-reduce:transform-none"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ClientTile({ client, openRequests, now }: { client: ClientRecord; openRequests: number | null; now: Date }) {
  const next = nextDue(client, now);
  const summary = profileSummary(client);
  return (
    <Link to={`/entities/${client.id}`} className={cx(cardLinkClass, 'flex flex-col gap-1')}>
      <span>
        <JurisdictionBadge j={client.jurisdiction} />
      </span>
      <p className="mt-2 text-[17px] leading-6 font-semibold">{client.name}</p>
      {summary && <p className="text-sm text-muted">{summary}</p>}
      {(next !== null || (openRequests ?? 0) > 0) && (
        <p className="mt-auto flex flex-wrap gap-x-3.5 gap-y-1 pt-3 text-[13px] text-muted">
          {next !== null && (
            <span>
              Next: <b className="font-semibold text-ink">{next.label}</b>, due {formatDay(next.dueDate)}
            </span>
          )}
          {(openRequests ?? 0) > 0 && <span>{plural(openRequests ?? 0, 'request open', 'requests open')}</span>}
        </p>
      )}
    </Link>
  );
}

export function WorkspaceHome() {
  const { session, pending } = useSessionInfo();
  const firmId = session?.activeFirmId ?? null;
  const [clients, setClients] = useState<ClientRecord[] | null>(null);
  const [openCounts, setOpenCounts] = useState<Record<string, number> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const now = useMemo(() => new Date(), []);
  const addFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The New client button sits above the list; bring the form into view when it opens.
    if (adding)
      addFormRef.current?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'center',
      });
  }, [adding]);

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
    // The counts are extra detail on the tiles: if they fail to load, the tiles show without them.
    apiJson<{ counts?: Record<string, number> }>('/requests/open-counts')
      .then((body) => {
        if (!cancelled) setOpenCounts(body.counts ?? null);
      })
      .catch(() => {
        if (!cancelled) setOpenCounts(null);
      });
    return () => {
      cancelled = true;
    };
  }, [firmId]);

  const dueCount = useMemo(() => (clients === null ? 0 : dueWithin(clients, now, 30).length), [clients, now]);

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
          <h2 className="mb-4 text-xl font-semibold tracking-tight">What will you use Compliance Hub for?</h2>
          <ul className="grid gap-5 sm:grid-cols-2">
            {NEW_WORKSPACE_TILES.map((t) => (
              <li key={t.to}>
                <Link to={t.to} className={cardLinkClass}>
                  <p className="font-semibold">{t.title}</p>
                  <p className="mt-1 text-sm text-muted">{t.text}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <KnowledgeHubCard tinted />
      </div>
    );
  }

  const isBusiness = session.activeWorkspaceKind === 'business';

  async function onCreate(body: ClientBody): Promise<string | null> {
    try {
      const res = await apiJson<{ client: ClientRecord }>('/clients', {
        method: 'POST',
        body,
      });
      setClients([res.client]);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Could not save the business';
    }
  }

  async function onAdd(body: ClientBody): Promise<string | null> {
    try {
      const res = await apiJson<{ client: ClientRecord }>('/clients', {
        method: 'POST',
        body,
      });
      setClients((rows) => [...(rows ?? []), res.client].sort((a, b) => a.name.localeCompare(b.name)));
      setAdding(false);
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Could not add the client';
    }
  }

  const lead = [
    session.activeFirmName ?? '',
    clients !== null && !isBusiness ? plural(clients.length, 'client', 'clients') : null,
    clients !== null && clients.length > 0 ? `${plural(dueCount, 'due date', 'due dates')} in the next 30 days` : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
        <h2 className="mb-4 text-xl font-semibold tracking-tight">Set up your business</h2>
        <ClientForm
          initial={{
            name: session.activeFirmName ?? '',
            notes: '',
            profile: defaultProfile('AU'),
          }}
          nameLabel="Business name"
          submitLabel="Save"
          onSubmit={onCreate}
        />
      </Card>
    );
  } else {
    const q = query.trim().toLowerCase();
    const shown = q === '' ? clients : clients.filter((c) => c.name.toLowerCase().includes(q));
    main = (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {dueCount > 0 ? (
            <DueSoon clients={clients} />
          ) : (
            <Card>
              <h2 className="text-xl font-semibold tracking-tight">Nothing due in the next 30 days</h2>
              <p className="mt-1 text-sm text-muted">Due dates come from each {isBusiness ? 'business' : 'client'}'s calendar details.</p>
            </Card>
          )}
        </div>

        <div className="order-last grid min-w-0 gap-6 lg:order-none lg:col-start-2 lg:row-start-1">
          <WorkspaceLinks title={isBusiness ? 'Your workspace' : 'Your practice'} />
          <KnowledgeHubCard tinted />
        </div>

        <section className="min-w-0 lg:col-span-2 lg:row-start-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-[22px] leading-7 font-semibold tracking-tight">{isBusiness ? 'Your business' : 'Clients'}</h2>
            {!isBusiness && clients.length > 0 && (
              <label className="relative w-full sm:w-64">
                <span className="sr-only">Find a client</span>
                <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <input type="search" className={cx(inputClass, 'pl-9')} placeholder="Find a client" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
            )}
          </div>
          {!isBusiness && clients.length === 0 && <p className="mt-4 text-muted">No clients yet. Add your first client to get a dashboard for it.</p>}
          {q !== '' && shown.length === 0 && <p className="mt-4 text-muted">No clients match “{query.trim()}”.</p>}
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {shown.map((c) => (
              <li key={c.id}>
                <ClientTile client={c} openRequests={openCounts === null ? null : (openCounts[c.id] ?? 0)} now={now} />
              </li>
            ))}
            {!isBusiness && q === '' && (
              <li>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="group flex h-full min-h-28 w-full flex-col items-center justify-center gap-2 rounded-3xl p-5 text-sm font-semibold text-accent outline-2 -outline-offset-2 outline-line outline-dashed transition-[background-color,outline-color] duration-150 ease-snappy hover:bg-accent-soft hover:outline-accent"
                >
                  <span
                    className="inline-flex size-10 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform duration-200 ease-snappy group-hover:rotate-90 motion-reduce:transform-none"
                    aria-hidden
                  >
                    <Plus size={18} />
                  </span>
                  Add a client
                </button>
              </li>
            )}
          </ul>
          {adding && (
            <div ref={addFormRef} className="mt-5">
              <Card>
                <h2 className="mb-4 text-xl font-semibold tracking-tight">New client</h2>
                <ClientForm
                  initial={{
                    name: '',
                    notes: '',
                    profile: defaultProfile('AU'),
                  }}
                  nameLabel="Client name"
                  submitLabel="Add client"
                  resetOnSuccess
                  onSubmit={onAdd}
                />
              </Card>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-10 sm:space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-accent uppercase">{isBusiness ? 'Business workspace' : 'Practice workspace'}</p>
          <h1 className="text-[30px] leading-9 font-semibold tracking-tight sm:text-[44px] sm:leading-[52px]">
            {greeting(now)}, {firstName}
          </h1>
          {lead && <p className="mt-2 text-base text-muted">{lead}</p>}
        </div>
        {!isBusiness && clients !== null && loadError === null && (
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden />
            New client
          </Button>
        )}
      </header>
      {main}
    </div>
  );
}
