import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Markdown } from '../../components/Markdown';
import { Callout, PageHeader } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { getLaw, type LawDetail } from '../../lib/laws';

type LoadState = { status: 'loading' } | { status: 'ready'; law: LawDetail } | { status: 'notFound' } | { status: 'error' };

export function LawDetailPage() {
  const { id = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getLaw(id)
      .then((body) => {
        if (!cancelled) setState({ status: 'ready', law: body.law });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 404 ? { status: 'notFound' } : { status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') return <p className="text-muted">Loading…</p>;
  if (state.status === 'notFound') return <Callout tone="bad">This law is not published.</Callout>;
  if (state.status === 'error') return <Callout tone="bad">Couldn't load the law.</Callout>;

  const { law } = state;
  return (
    <div className="space-y-6">
      <PageHeader title={law.title} lead={law.citation} />
      {law.kind === 'bill' && (
        <span className="inline-flex rounded-full bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">Bill: not law</span>
      )}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Version</dt>
          <dd>{law.versionLabel}</dd>
        </div>
        <div>
          <dt className="text-muted">In force from</dt>
          <dd>{law.effectiveFrom ?? 'Not stated'}</dd>
        </div>
        <div>
          <dt className="text-muted">Retrieved</dt>
          <dd>{law.retrievedOn}</dd>
        </div>
        <div>
          <dt className="text-muted">Published by</dt>
          <dd>{law.publisher}</dd>
        </div>
      </dl>
      <Markdown body={law.bodyMd} />
    </div>
  );
}
