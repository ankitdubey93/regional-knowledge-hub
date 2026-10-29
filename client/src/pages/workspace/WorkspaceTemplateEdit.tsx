import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Callout, Card, Field, inputClass, PageHeader, TextLink } from '../../components/ui';
import { ApiError } from '../../lib/api';
import {
  deleteTemplate,
  ENGAGEMENT_KIND_LABELS,
  getTemplate,
  updateTemplate,
  type TemplateView,
} from '../../lib/engagements';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; template: TemplateView };

interface Row {
  title: string;
  estimate: string;
}

function rowsFrom(template: TemplateView): Row[] {
  return template.steps.map((s) => ({ title: s.title, estimate: s.estimateMinutes === null ? '' : String(s.estimateMinutes) }));
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export function WorkspaceTemplateEdit() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getTemplate(id)
      .then((template) => {
        if (cancelled) return;
        setName(template.name);
        setRows(rowsFrom(template));
        setState({ status: 'ready', template });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'missing' });
        } else {
          setState({ status: 'error', message: errorMessage(err, 'Could not load the template') });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function setRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === index ? { ...r, ...patch } : r)));
  }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const template = await updateTemplate(id, {
        name,
        steps: rows.map((r) => ({ title: r.title, estimateMinutes: r.estimate === '' ? null : Number.parseInt(r.estimate, 10) })),
      });
      setState({ status: 'ready', template });
      setMessage('Saved.');
    } catch (err) {
      setError(errorMessage(err, 'Could not save the template'));
    }
  }

  async function onDelete() {
    if (!window.confirm('Delete this template?')) return;
    setMessage(null);
    setError(null);
    try {
      await deleteTemplate(id);
      navigate('/workspace/templates');
    } catch (err) {
      setError(errorMessage(err, 'Could not delete the template'));
    }
  }

  if (state.status === 'loading') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace/templates">Back to templates</TextLink>
        <p className="text-muted">Loading…</p>
      </div>
    );
  }
  if (state.status === 'missing') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace/templates">Back to templates</TextLink>
        <p>Template not found.</p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-6">
        <TextLink to="/workspace/templates">Back to templates</TextLink>
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      </div>
    );
  }

  const loaded = state.template;
  return (
    <div className="space-y-6">
      <TextLink to="/workspace/templates">Back to templates</TextLink>
      <PageHeader title={loaded.name} lead={`${ENGAGEMENT_KIND_LABELS[loaded.kind]} template`} />

      <Card>
        <form aria-label="Edit template" onSubmit={(e) => void onSave(e)}>
          <Field label="Name">
            <input type="text" required maxLength={120} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <h2 className="mt-4 font-semibold">Steps</h2>
          <ol className="mt-2 space-y-2">
            {rows.map((r, i) => {
              const n = i + 1;
              return (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    aria-label={`Step ${n}`}
                    maxLength={300}
                    className={`${inputClass} sm:flex-1`}
                    value={r.title}
                    onChange={(e) => setRow(i, { title: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    step={1}
                    aria-label={`Estimate in minutes for step ${n}`}
                    className={`${inputClass} sm:w-40`}
                    value={r.estimate}
                    onChange={(e) => setRow(i, { estimate: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`Remove step ${n}`}
                    disabled={rows.length === 1}
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setRows((prev) => [...prev, { title: '', estimate: '' }])}>
              Add step
            </Button>
            <Button type="submit">Save template</Button>
          </div>
        </form>
      </Card>

      <Button variant="secondary" onClick={() => void onDelete()}>
        Delete template
      </Button>

      {error !== null && <Callout tone="bad">{error}</Callout>}
      {message !== null && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
