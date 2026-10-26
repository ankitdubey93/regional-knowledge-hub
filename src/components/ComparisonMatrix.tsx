import { useMemo, useState } from 'react';
import type { StandardsMapping } from '../data/schemas';
import { cx } from './ui';
import type { FrameworkId } from '../lib/scope';

/**
 * Topic-by-topic comparison of the four frameworks. Each topic is a row of
 * cells that wraps on narrow screens instead of scrolling sideways.
 */
export function ComparisonMatrix({ data, frameworks: initialFrameworks }: { data: StandardsMapping; frameworks?: FrameworkId[] }) {
  const groups = useMemo(() => ['All', ...new Set(data.topics.map((t) => t.group))], [data]);
  const [group, setGroup] = useState('All');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const has = (id: FrameworkId) => initialFrameworks === undefined || initialFrameworks.includes(id);
  const [shown, setShown] = useState<Record<FrameworkId, boolean>>({ ifrs: has('ifrs'), frs102: has('frs102'), frs105: has('frs105'), aasb: has('aasb') });
  const [query, setQuery] = useState('');

  const frameworks = data.frameworks.filter((f) => shown[f.id]);
  const q = query.trim().toLowerCase();
  const topics = data.topics.filter(
    (t) =>
      (group === 'All' || t.group === group) &&
      (!onlyChanged || t.changed2026) &&
      (q === '' || [t.topic, t.takeaway, ...frameworks.map((f) => t[f.id].summary + ' ' + t[f.id].ref)].join(' ').toLowerCase().includes(q)),
  );

  return (
    <div>
      <div className="mb-6 grid gap-4 rounded-xl border border-line bg-panel p-4 md:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Topic group">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
              className={cx('min-h-9 rounded-full border px-3 text-sm', group === g ? 'border-accent bg-accent-soft' : 'border-line hover:bg-panel-2')}
            >
              {g}
            </button>
          ))}
          <label className="flex min-h-9 items-center gap-2 rounded-full border border-line px-3 text-sm">
            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} className="accent-[var(--accent)]" />
            Changed in 2026 only
          </label>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search, e.g. goodwill"
          aria-label="Search topics"
          className="min-h-9 rounded-lg border border-line bg-panel px-3 text-base sm:text-sm"
        />
        <fieldset className="flex flex-wrap gap-3 md:col-span-2">
          <legend className="sr-only">Frameworks to show</legend>
          {data.frameworks.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={shown[f.id]}
                onChange={(e) => setShown((s) => ({ ...s, [f.id]: e.target.checked }))}
              />
              {f.name}
            </label>
          ))}
        </fieldset>
      </div>

      {topics.length === 0 && <p className="text-muted">No topic matches those filters.</p>}

      <div className="space-y-6">
        {topics.map((t) => (
          <section key={t.id} aria-labelledby={`t-${t.id}`} className="rounded-xl border border-line bg-panel">
            <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <h2 id={`t-${t.id}`} className="font-semibold">
                {t.topic}
              </h2>
              <span className="text-xs text-muted">{t.group}</span>
              {t.changed2026 && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">FRS 102 changed in 2026</span>}
            </header>
            <div className={cx('grid gap-px bg-line', frameworks.length > 1 && 'md:grid-cols-2', frameworks.length > 2 && 'xl:grid-cols-4')}>
              {frameworks.map((f) => (
                <div key={f.id} className="bg-panel p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{f.name}</p>
                  <p className="mt-1 text-sm">{t[f.id].summary}</p>
                  <p className="mt-2 text-xs text-muted">{t[f.id].ref}</p>
                </div>
              ))}
            </div>
            <p className="border-t border-line px-4 py-3 text-sm">
              <span className="font-medium">In practice: </span>
              {t.takeaway}
            </p>
          </section>
        ))}
      </div>

      <dl className="mt-8 grid gap-3 text-sm sm:grid-cols-2">
        {data.frameworks.map((f) => (
          <div key={f.id} className="rounded-lg bg-panel-2 p-3">
            <dt className="font-medium">
              {f.name} <span className="text-muted">({f.issuer})</span>
            </dt>
            <dd className="text-muted">{f.appliesTo}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
