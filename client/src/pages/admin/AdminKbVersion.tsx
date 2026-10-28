import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RequireAdmin } from '../../components/RequireAdmin';
import { Button, Callout, Card, Field, PageHeader, TextLink, inputClass } from '../../components/ui';
import { NotFound } from '../NotFound';
import {
  STATUS_LABELS,
  getVersion,
  publishVersion,
  updateVersion,
  withdrawVersion,
  type KbDiff,
  type KbVersionDetail,
} from '../../lib/admin';
import { ApiError } from '../../lib/api';

function DiffList({ name, keys }: { name: string; keys: string[] }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-medium">{name}</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {keys.map((k, i) => (
          <li key={i}>{k}</li>
        ))}
      </ul>
    </details>
  );
}

function Changes({ diff }: { diff: KbDiff }) {
  if (diff.against === null) {
    return (
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Changes</h2>
        <p>{`First version of this source: ${diff.added.length} sections.`}</p>
      </Card>
    );
  }
  const summary = `Compared with ${diff.against.label}: ${diff.added.length} added · ${diff.changed.length} changed · ${diff.removed.length} removed · ${diff.unchanged} unchanged`;
  return (
    <Card>
      <h2 className="mb-2 text-lg font-semibold">Changes</h2>
      <p>{summary}</p>
      <DiffList name="Added" keys={diff.added} />
      <DiffList name="Changed" keys={diff.changed} />
      <DiffList name="Removed" keys={diff.removed} />
    </Card>
  );
}

// Keyed by version id in VersionPanel, so the text box resets only when a different version opens.
function VersionView({ detail, onChange }: { detail: KbVersionDetail; onChange: (d: KbVersionDetail) => void }) {
  const { version, source, chunks, diff } = detail;
  const isDraft = version.status === 'draft';
  const blocked = version.issues.some((i) => i.level === 'block');
  const [bodyMd, setBodyMd] = useState(version.bodyMd);
  const [actionError, setActionError] = useState<string | null>(null);
  const [justPublished, setJustPublished] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  function fail(err: unknown, fallback: string) {
    setActionError(err instanceof ApiError ? err.message : fallback);
  }

  async function rechunk() {
    setActionError(null);
    try {
      const res = await updateVersion(version.id, { bodyMd });
      onChange(res.detail);
    } catch (err) {
      fail(err, 'Could not re-chunk this version');
    }
  }

  async function publish() {
    setActionError(null);
    try {
      const res = await publishVersion(version.id);
      onChange(res.detail);
      setJustPublished(true);
    } catch (err) {
      fail(err, 'Could not publish this version');
    }
  }

  async function withdraw() {
    setActionError(null);
    try {
      const res = await withdrawVersion(version.id);
      onChange(res.detail);
      setConfirmWithdraw(false);
    } catch (err) {
      fail(err, 'Could not withdraw this version');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={version.label} lead={`${source.citation} · ${STATUS_LABELS[version.status]}`}>
        <div className="mt-4">
          <TextLink to={`/admin/kb/sources/${source.id}`}>Back to the source</TextLink>
        </div>
      </PageHeader>

      {version.issues.length > 0 && (
        <div id="version-issues" className="space-y-2">
          {version.issues.map((issue, i) => (
            <Callout key={`${issue.code}-${i}`} tone={issue.level === 'block' ? 'bad' : 'warn'}>
              <strong>{issue.level === 'block' ? 'Must fix' : 'Check'}:</strong> {issue.message}
            </Callout>
          ))}
        </div>
      )}

      <Changes diff={diff} />

      <div className="flex flex-wrap items-start gap-2">
        {isDraft && (
          <Button
            onClick={publish}
            disabled={blocked}
            aria-describedby={version.issues.length > 0 ? 'version-issues' : undefined}
          >
            Publish
          </Button>
        )}
        {(version.status === 'draft' || version.status === 'published') && (
          <Button variant="secondary" onClick={() => setConfirmWithdraw(true)}>
            Withdraw
          </Button>
        )}
      </div>
      {confirmWithdraw && (
        <Card>
          <div className="space-y-4">
            <p>Withdraw this version? It stops being searched.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={withdraw}>Confirm withdraw</Button>
              <Button variant="ghost" onClick={() => setConfirmWithdraw(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}
      {justPublished && <Callout tone="good">Published.</Callout>}
      {actionError !== null && <Callout tone="bad">{actionError}</Callout>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <div className="space-y-4">
            <Field label="Text">
              <textarea
                rows={24}
                className={inputClass}
                value={bodyMd}
                readOnly={!isDraft}
                onChange={(e) => setBodyMd(e.target.value)}
              />
            </Field>
            {isDraft && (
              <Button variant="secondary" onClick={rechunk}>
                Re-chunk
              </Button>
            )}
          </div>
        </Card>

        <Card className="min-w-0">
          <h2 className="mb-4 text-lg font-semibold">{`Chunks (${chunks.length})`}</h2>
          <ol className="space-y-4">
            {chunks.map((c) => (
              <li key={c.id} className="min-w-0 space-y-1 border-b border-line pb-4 text-sm">
                <p className="font-medium">{c.headingPath.length === 0 ? 'Before the first heading' : c.headingPath.join(' › ')}</p>
                <div className="flex flex-wrap items-center gap-2 text-muted">
                  {c.provisionRef !== null && (
                    <span className="rounded-full bg-panel-2 px-2 py-0.5 text-xs font-medium text-ink">{c.provisionRef}</span>
                  )}
                  <span>{`~${c.tokens} tokens`}</span>
                </div>
                <p className="break-words">{c.text.length > 300 ? `${c.text.slice(0, 300)}…` : c.text}</p>
                <details>
                  <summary className="cursor-pointer text-accent">Full text</summary>
                  <pre className="whitespace-pre-wrap break-words">{c.text}</pre>
                </details>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

// Data lives in its own component so that nothing is fetched until RequireAdmin has passed.
function VersionPanel() {
  const { id = '' } = useParams();
  const [detail, setDetail] = useState<KbVersionDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setNotFound(false);
    getVersion(id)
      .then((body) => {
        if (!cancelled) setDetail(body.detail);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setLoadError(err instanceof ApiError ? err.message : 'Could not load this version');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (notFound) return <NotFound />;
  if (detail === null) {
    return loadError !== null ? <Callout tone="bad">{loadError}</Callout> : <p className="text-muted">Loading…</p>;
  }
  return <VersionView key={detail.version.id} detail={detail} onChange={setDetail} />;
}

export function AdminKbVersion() {
  return (
    <RequireAdmin>
      <VersionPanel />
    </RequireAdmin>
  );
}
