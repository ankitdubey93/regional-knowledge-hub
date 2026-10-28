import { useEffect, useState } from 'react';
import { AdminNav } from '../../components/AdminNav';
import { RequireAdmin } from '../../components/RequireAdmin';
import { Button, Callout, Card, PageHeader, TextLink } from '../../components/ui';
import { embedMissing, getOverview, type AdminOverview } from '../../lib/admin';
import { ApiError } from '../../lib/api';

// Mounted only inside RequireAdmin, so the overview is never requested by a non-admin.
function OverviewStats() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [embedding, setEmbedding] = useState(false);
  const [embedMessage, setEmbedMessage] = useState<string | null>(null);
  const [embedError, setEmbedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOverview()
      .then((body) => {
        if (!cancelled) setOverview(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load the overview');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function onEmbedNow() {
    setEmbedding(true);
    setEmbedError(null);
    setEmbedMessage(null);
    try {
      const out = await embedMissing();
      setEmbedMessage(`Embedded ${out.embedded} sections. ${out.remaining} left.`);
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      setEmbedError(err instanceof ApiError ? err.message : 'Could not embed the sections');
    } finally {
      setEmbedding(false);
    }
  }

  if (error !== null) return <Callout tone="bad">{error}</Callout>;
  if (overview === null) return <p className="text-muted">Loading…</p>;

  const stats = [
    { label: 'Users', value: overview.users },
    { label: 'Sources', value: overview.sources },
    { label: 'Published versions', value: overview.publishedVersions },
    { label: 'Drafts waiting', value: overview.drafts },
    { label: 'Sections without embeddings', value: overview.chunksWithoutEmbedding },
  ];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 rounded-xl border border-line bg-panel p-4">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="mt-1 text-2xl font-semibold">{s.value}</dd>
          </div>
        ))}
      </dl>
      {overview.embeddingsEnabled && overview.chunksWithoutEmbedding > 0 && (
        <Button variant="secondary" onClick={onEmbedNow} disabled={embedding}>
          Embed now
        </Button>
      )}
      {embedMessage !== null && <Callout tone="good">{embedMessage}</Callout>}
      {embedError !== null && <Callout tone="bad">{embedError}</Callout>}
      {!overview.embeddingsEnabled && (
        <Callout tone="warn">Embeddings are off: set GEMINI_API_KEY on the server. Search uses keywords only.</Callout>
      )}
    </div>
  );
}

export function AdminHome() {
  return (
    <RequireAdmin>
      <div className="space-y-6">
        <PageHeader title="Admin" lead="Users and the knowledge base." />
        <AdminNav />
        <OverviewStats />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h2 className="text-lg font-semibold">Users</h2>
            <p className="mt-1 text-sm text-muted">Everyone who has signed up, with their workspaces.</p>
            <div className="mt-3">
              <TextLink to="/admin/users">Open users</TextLink>
            </div>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">Knowledge base</h2>
            <p className="mt-1 text-sm text-muted">Add Acts, Bills and guidance, check how they split, and publish.</p>
            <div className="mt-3">
              <TextLink to="/admin/kb">Open the knowledge base</TextLink>
            </div>
          </Card>
        </div>
      </div>
    </RequireAdmin>
  );
}
