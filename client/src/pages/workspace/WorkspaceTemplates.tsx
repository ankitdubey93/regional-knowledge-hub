import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Callout, Card, PageHeader, TextLink } from '../../components/ui';
import { ApiError } from '../../lib/api';
import {
  copyTemplate,
  ENGAGEMENT_KIND_LABELS,
  listTemplates,
  type SeedTemplate,
  type TemplateView,
} from '../../lib/engagements';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; seeded: SeedTemplate[]; templates: TemplateView[] };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function WorkspaceTemplates() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTemplates()
      .then((body) => {
        if (!cancelled) setState({ status: 'ready', seeded: body.seeded, templates: body.templates });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(err, 'Could not load the templates') });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCopy(seedId: string) {
    setError(null);
    try {
      const template = await copyTemplate(seedId);
      navigate(`/workspace/templates/${template.id}`);
    } catch (err) {
      setError(errorMessage(err, 'Could not copy the template'));
    }
  }

  return (
    <div className="space-y-6">
      <TextLink to="/workspace">Back to workspace</TextLink>
      <PageHeader
        title="Templates"
        lead="Engagement templates for this firm. Suggested steps are common practice, not law: copy one and change it to fit how you work."
      />

      {state.status === 'loading' && <p className="text-muted">Loading…</p>}
      {state.status === 'error' && <Callout tone="bad">{state.message}</Callout>}
      {error !== null && <Callout tone="bad">{error}</Callout>}

      {state.status === 'ready' && (
        <>
          <Card>
            <h2 className="font-semibold">Suggested templates</h2>
            <ul className="mt-3 space-y-2">
              {state.seeded.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{t.name}</span>
                  {` · ${ENGAGEMENT_KIND_LABELS[t.kind]} · ${t.jurisdiction ?? 'AU and UK'} · ${t.steps.length} steps`}
                  <Button variant="secondary" aria-label={`Copy ${t.name}`} onClick={() => void onCopy(t.id)}>
                    Copy
                  </Button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="font-semibold">Your templates</h2>
            {state.templates.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No templates yet. Copy a suggested one to start.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {state.templates.map((t) => (
                  <li key={t.id}>
                    <TextLink to={`/workspace/templates/${t.id}`}>{t.name}</TextLink>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
