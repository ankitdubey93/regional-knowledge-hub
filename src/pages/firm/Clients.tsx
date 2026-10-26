import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, apiJson } from '../../lib/api';
import { useSessionInfo } from '../../lib/session';
import { Button, Card, Field, JurisdictionBadge, PageHeader, TextLink, inputClass } from '../../components/ui';

interface ClientRow {
  id: string;
  name: string;
  jurisdiction: 'AU' | 'UK' | 'AU+UK';
  notes: string;
  entities: string[];
}

function parseJurisdiction(value: string): ClientRow['jurisdiction'] {
  if (value === 'UK') return 'UK';
  if (value === 'AU+UK') return 'AU+UK';
  return 'AU';
}

export function Clients() {
  const { session, pending } = useSessionInfo();
  const firmId = session?.activeFirmId ?? null;
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [jurisdiction, setJurisdiction] = useState<ClientRow['jurisdiction']>('AU');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (firmId === null) return;
    let cancelled = false;
    setLoadError(null);
    apiJson<{ clients: ClientRow[] }>('/clients')
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

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    try {
      const body = await apiJson<{ client: ClientRow }>('/clients', { method: 'POST', body: { name, jurisdiction } });
      setClients((rows) => [...rows, body.client].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not add the client');
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
        <p>Create a firm first.</p>
        <TextLink to="/firm/new">Set up your firm</TextLink>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Clients" lead="Group your work under a heading for each client." />
      <Card>
        <form onSubmit={onAdd} className="space-y-4">
          <Field label="Client name">
            <input
              type="text"
              required
              maxLength={120}
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Jurisdiction">
            <select
              className={inputClass}
              value={jurisdiction}
              onChange={(e) => setJurisdiction(parseJurisdiction(e.target.value))}
            >
              <option value="AU">Australia</option>
              <option value="UK">United Kingdom</option>
              <option value="AU+UK">Both</option>
            </select>
          </Field>
          {saveError !== null && (
            <p role="alert" className="text-sm text-bad">
              {saveError}
            </p>
          )}
          <Button type="submit">Add client</Button>
        </form>
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
            <li key={c.id} className="flex items-center gap-3 py-3">
              <JurisdictionBadge j={c.jurisdiction} />
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
