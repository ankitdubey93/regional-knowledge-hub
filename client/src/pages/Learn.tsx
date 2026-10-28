import { Link } from 'react-router-dom';
import { docsIn, SECTIONS } from '../content/docs';
import { JurisdictionBadge, PageHeader } from '../components/ui';
import { useHubScope } from '../lib/hubScope';
import { inScope, scopeName } from '../lib/scope';

export function Learn() {
  const { scope } = useHubScope();
  const paths = SECTIONS.map((s) => ({ s, items: docsIn(s.id).filter((d) => inScope(d.jurisdiction, scope)) })).filter((p) => p.items.length > 0);
  return (
    <div>
      <PageHeader
        title="Learn"
        lead={
          scope === 'all'
            ? 'Fourteen topics in four paths. Core accounting first if you are new to bookkeeping; then the country you will work in.'
            : `Topics for ${scopeName(scope)}, with core accounting and the standards that apply.`
        }
      />
      <div className="space-y-10">
        {paths.map(({ s, items }) => (
          <section key={s.id} id={s.id} aria-labelledby={`h-${s.id}`} className="scroll-mt-20">
            <h2 id={`h-${s.id}`} className="text-xl font-semibold">
              {s.title}
            </h2>
            <p className="mb-4 text-muted">{s.blurb}</p>
            <ul className="grid gap-3 md:grid-cols-2">
              {items.map((d) => (
                <li key={d.id}>
                  <Link to={`/knowledge/learn/${d.id}`} className="block h-full rounded-xl border border-line bg-panel p-4 hover:border-accent">
                    <div className="flex flex-wrap items-center gap-2">
                      <JurisdictionBadge j={d.jurisdiction} />
                      <span className="text-xs text-muted">
                        {d.level} · {d.minutes} min
                      </span>
                    </div>
                    <p className="mt-2 font-medium">{d.title}</p>
                    <p className="mt-1 text-sm text-muted">{d.summary}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
