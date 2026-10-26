import { Link } from 'react-router-dom';
import { docsIn, SECTIONS } from '../content/docs';
import { JurisdictionBadge, PageHeader } from '../components/ui';

export function Learn() {
  return (
    <div>
      <PageHeader title="Learn" lead="Fourteen topics in four paths. Core accounting first if you are new to bookkeeping; then the country you will work in." />
      <div className="space-y-10">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`h-${s.id}`} className="scroll-mt-20">
            <h2 id={`h-${s.id}`} className="text-xl font-semibold">
              {s.title}
            </h2>
            <p className="mb-4 text-muted">{s.blurb}</p>
            <ul className="grid gap-3 md:grid-cols-2">
              {docsIn(s.id).map((d) => (
                <li key={d.id}>
                  <Link to={`/learn/${d.id}`} className="block h-full rounded-xl border border-line bg-panel p-4 hover:border-accent">
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
