import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ClientForm } from '../../components/ClientForm';
import { Button, Card, PageHeader, TextLink } from '../../components/ui';
import { ApiError, apiDelete, apiJson } from '../../lib/api';
import { profileOf, profileSummary, type ClientBody, type ClientRecord } from '../../lib/entity';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; client: ClientRecord };

export function ClientDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function onSave(body: ClientBody): Promise<string | null> {
    try {
      const res = await apiJson<{ client: ClientRecord }>(`/clients/${id}`, { method: 'PATCH', body });
      setState({ status: 'ready', client: res.client });
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Could not save the client';
    }
  }

  async function onDelete(client: ClientRecord) {
    if (!window.confirm(`Delete ${client.name}? This cannot be undone.`)) return;
    setDeleteError(null);
    try {
      await apiDelete(`/clients/${id}`);
      navigate('/clients');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete the client');
    }
  }

  return (
    <div className="space-y-6">
      <TextLink to="/clients">Back to clients</TextLink>
      {state.status === 'loading' && <p className="text-muted">Loading…</p>}
      {state.status === 'missing' && (
        <>
          <p>Client not found.</p>
          <TextLink to="/clients">Back to clients</TextLink>
        </>
      )}
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <PageHeader title={state.client.name} lead={profileSummary(state.client)} />
          <Card>
            <ClientForm
              initial={{ name: state.client.name, notes: state.client.notes, profile: profileOf(state.client) }}
              nameLabel="Client name"
              submitLabel="Save changes"
              onSubmit={onSave}
            />
          </Card>
          {!state.client.isSelf && (
            <div className="space-y-2">
              <Button variant="secondary" type="button" onClick={() => void onDelete(state.client)}>
                Delete client
              </Button>
              {deleteError !== null && (
                <p role="alert" className="text-sm text-bad">
                  {deleteError}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
