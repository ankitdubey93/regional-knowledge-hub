import { useEffect, useState } from 'react';
import { Callout, Card, Field, JurisdictionBadge, PageHeader, TextLink, inputClass } from '../../components/ui';
import { KIND_LABELS } from '../../lib/admin';
import { useHubScope } from '../../lib/hubScope';
import { listLaws, type LawKind, type LawListItem } from '../../lib/laws';
import { inScope } from '../../lib/scope';

const LAW_KINDS: LawKind[] = ['act', 'regulation', 'bill', 'ruling', 'standard'];

function asLawKind(v: string): LawKind | '' {
  return LAW_KINDS.find((k) => k === v) ?? '';
}

export function Laws() {
  const { scope } = useHubScope();
  const [laws, setLaws] = useState<LawListItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [kind, setKind] = useState<LawKind | ''>('');

  useEffect(() => {
    let cancelled = false;
    listLaws()
      .then((body) => {
        if (!cancelled) setLaws(body.laws);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = (laws ?? []).filter((l) => inScope(l.jurisdiction, scope) && (kind === '' || l.kind === kind));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Laws and standards"
        lead="The official text the assistant answers from, as published in the knowledge base. Each item links to its official source."
      />

      <Field label="Kind">
        <select className={inputClass} value={kind} onChange={(e) => setKind(asLawKind(e.target.value))}>
          <option value="">All</option>
          {LAW_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>

      {loadError && <Callout tone="bad">Couldn't load the laws.</Callout>}
      {!loadError && laws === null && <p className="text-muted">Loading…</p>}
      {laws !== null && laws.length === 0 && <p className="text-muted">No laws published yet.</p>}
      {laws !== null && laws.length > 0 && visible.length === 0 && <p className="text-muted">Nothing matches this filter.</p>}

      {visible.length > 0 && (
        <ul className="space-y-4">
          {visible.map((law) => (
            <li key={law.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <JurisdictionBadge j={law.jurisdiction} />
                  <span className="text-sm text-muted">{KIND_LABELS[law.kind]}</span>
                  {law.kind === 'bill' && (
                    <span className="inline-flex rounded-full bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad">Bill: not law</span>
                  )}
                </div>
                <h2 className="mt-3 text-lg font-semibold">
                  <TextLink to={`/knowledge/laws/${law.id}`}>{law.title}</TextLink>
                </h2>
                <p className="mt-1 text-sm">{law.citation}</p>
                <p className="mt-1 text-sm text-muted">{`${law.versionLabel} · retrieved ${law.retrievedOn}`}</p>
                {law.officialUrl !== null && (
                  <a
                    href={law.officialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-sm font-medium text-accent underline underline-offset-2 hover:text-accent-hover"
                  >
                    Official source
                  </a>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
