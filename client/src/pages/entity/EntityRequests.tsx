import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { formatDay } from '@chub/shared/utils/deadlines';
import { Button, Callout, Card, Field, inputClass, PageHeader, TableScroll, TextLink } from '../../components/ui';
import { ApiError, apiJson } from '../../lib/api';
import type { ClientRecord } from '../../lib/entity';
import { addRequest, deleteRequest, generateRequests, listRequests, setRequestStatus, type RequestView } from '../../lib/requests';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; client: ClientRecord };

type Status = RequestView['status'];

const STATUS_LABELS: Record<Status, string> = { open: 'Open', received: 'Received', waived: 'Waived' };

const linkClass = 'font-medium text-accent underline underline-offset-2 hover:text-accent-hover';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function SourceCell({ r }: { r: RequestView }) {
  if (r.source === 'manual') return <>Added by staff</>;
  if (r.sourceUrl !== null) {
    return (
      <a href={r.sourceUrl} target="_blank" rel="noreferrer" className={linkClass}>
        {r.verifiedOn !== null ? 'Checked' : 'Not checked'}
      </a>
    );
  }
  if (r.docId !== null) return <TextLink to={`/knowledge/learn/${r.docId}`}>Guide</TextLink>;
  return <>Not checked</>;
}

export function EntityRequests() {
  const { id = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newDueOn, setNewDueOn] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    apiJson<{ client: ClientRecord }>(`/clients/${id}`)
      .then(async (body) => {
        const list = await listRequests(id);
        if (cancelled) return;
        setRequests(list);
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

  async function onGenerate() {
    begin();
    try {
      const out = await generateRequests(id);
      setRequests(out.requests);
      setMessage(out.created === 0 ? 'Nothing new to add.' : out.created === 1 ? 'Added 1 request.' : `Added ${out.created} requests.`);
    } catch (err) {
      setError(errorMessage(err, 'Could not generate requests'));
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    begin();
    try {
      const created = await addRequest(id, { label: newLabel, dueOn: newDueOn === '' ? null : newDueOn });
      setRequests((prev) => [...prev, created]);
      setNewLabel('');
      setNewDueOn('');
      setMessage('Added.');
    } catch (err) {
      setError(errorMessage(err, 'Could not add the request'));
    } finally {
      setBusy(false);
    }
  }

  async function onStatus(r: RequestView, status: Status) {
    begin();
    try {
      const updated = await setRequestStatus(id, r.id, status);
      setRequests((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(errorMessage(err, 'Could not update the request'));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(r: RequestView) {
    if (!window.confirm('Delete this request?')) return;
    begin();
    try {
      await deleteRequest(id, r.id);
      setRequests((prev) => prev.filter((x) => x.id !== r.id));
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the request'));
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
      <PageHeader title="Requests" lead={`Documents to ask ${c.name} for, worked out from its profile and due dates.`} />
      <Callout tone="warn">Requests are listed here, not sent. Items marked Not checked have not been confirmed against their official source.</Callout>

      <Card>
        <h2 className="font-semibold">Generate</h2>
        <p className="mt-2 text-sm text-muted">
          Adds the requests this entity's profile and next 90 days of due dates call for. Items you have marked received or waived are kept.
        </p>
        <Button className="mt-3" disabled={busy} onClick={() => void onGenerate()}>
          Generate from profile
        </Button>
      </Card>

      <Card>
        <form aria-label="Add a request" onSubmit={(e) => void onAdd(e)}>
          <div className="space-y-3">
            <Field label="What to ask for">
              <input
                type="text"
                required
                maxLength={200}
                className={inputClass}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </Field>
            <Field label="Due date (optional)">
              <input type="date" className={inputClass} value={newDueOn} onChange={(e) => setNewDueOn(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" className="mt-3" disabled={busy}>
            Add request
          </Button>
        </form>
      </Card>

      {error !== null && <Callout tone="bad">{error}</Callout>}
      {message !== null && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}

      <Card>
        <h2 className="font-semibold">Requests</h2>
        {requests.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No requests yet. Generate them from the profile or add one.</p>
        ) : (
          <TableScroll>
            <table className="mt-3 w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Due</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">What</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Status</th>
                  <th scope="col" className="border-b border-line px-2 py-1 font-medium">Source</th>
                  <th scope="col" className="relative border-b border-line px-2 py-1 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap border-b border-line px-2 py-1">{r.dueOn === null ? 'No date' : formatDay(r.dueOn)}</td>
                    <td className="border-b border-line px-2 py-1">
                      {r.label}
                      {r.why !== '' && <span className="block text-xs text-muted">{r.why}</span>}
                    </td>
                    <td className="border-b border-line px-2 py-1">{STATUS_LABELS[r.status]}</td>
                    <td className="border-b border-line px-2 py-1">
                      <SourceCell r={r} />
                    </td>
                    <td className="border-b border-line px-2 py-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {r.status === 'open' ? (
                          <>
                            <Button variant="secondary" aria-label={`Mark ${r.label} received`} onClick={() => void onStatus(r, 'received')}>
                              Received
                            </Button>
                            <Button variant="secondary" aria-label={`Waive ${r.label}`} onClick={() => void onStatus(r, 'waived')}>
                              Waive
                            </Button>
                          </>
                        ) : (
                          <Button variant="secondary" aria-label={`Reopen ${r.label}`} onClick={() => void onStatus(r, 'open')}>
                            Reopen
                          </Button>
                        )}
                        <Button variant="secondary" aria-label={`Delete ${r.label}`} onClick={() => void onDelete(r)}>
                          Delete
                        </Button>
                      </div>
                    </td>
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
