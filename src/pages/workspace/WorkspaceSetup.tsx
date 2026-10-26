import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EntityFields } from '../../components/EntityFields';
import { Button, Card, Field, PageHeader, inputClass } from '../../components/ui';
import { apiJson } from '../../lib/api';
import { defaultProfile, type EntityProfile, type WorkspaceKind } from '../../lib/entity';
import { createWorkspace } from '../../lib/session';

export function WorkspaceSetup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [kind, setKind] = useState<WorkspaceKind>(params.get('kind') === 'practice' ? 'practice' : 'business');
  const [name, setName] = useState('');
  const [profile, setProfile] = useState<EntityProfile>(defaultProfile('AU'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const message = await createWorkspace(name, kind);
    if (message !== null) {
      setBusy(false);
      setError(message);
      return;
    }
    if (kind === 'practice') {
      navigate('/workspace');
      return;
    }
    try {
      const res = await apiJson<{ client: { id: string } }>('/clients', { method: 'POST', body: { name, notes: '', ...profile } });
      navigate(`/entities/${res.client.id}`);
    } catch {
      // /workspace shows the setup form, so nothing is stranded.
      navigate('/workspace');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New workspace"
        lead="A business workspace is for your own books. A practice workspace holds a heading for each client. Other workspaces cannot see its data."
      />
      <Card className="max-w-2xl">
        <form onSubmit={onSubmit} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">What is this workspace for?</legend>
            <div className="space-y-2">
              <label className="flex items-start gap-2 rounded-lg border border-line p-3">
                <input
                  type="radio"
                  name="kind"
                  value="business"
                  checked={kind === 'business'}
                  onChange={() => setKind('business')}
                  className="mt-1"
                />
                <span>My own business</span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-line p-3">
                <input
                  type="radio"
                  name="kind"
                  value="practice"
                  checked={kind === 'practice'}
                  onChange={() => setKind('practice')}
                  className="mt-1"
                />
                <span>An accounting or bookkeeping practice</span>
              </label>
            </div>
          </fieldset>
          <Field label={kind === 'business' ? 'Business name' : 'Practice name'}>
            <input
              type="text"
              required
              maxLength={120}
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          {kind === 'business' && <EntityFields value={profile} onChange={setProfile} />}
          {error !== null && (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            Create workspace
          </Button>
        </form>
      </Card>
    </div>
  );
}
