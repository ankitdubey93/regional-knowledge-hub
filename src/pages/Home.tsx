import { Link } from 'react-router-dom';
import { ArrowRight, Calculator, GraduationCap, Scale, Shuffle } from 'lucide-react';
import { docs, docsIn, findDoc, SECTIONS } from '../content/docs';
import { useProgress } from '../progress/ProgressContext';
import { Card, cx } from '../components/ui';
import { flashcards } from '../data';
import { isDue, todayIso } from '../utils/srs';

const quick = [
  { to: '/tools/journal', icon: Shuffle, title: 'Journal simulator', text: 'Post entries, see T-accounts' },
  { to: '/tools/tax', icon: Calculator, title: 'Tax calculator', text: 'BAS, VAT return, super, NIC' },
  { to: '/compare', icon: Scale, title: 'Compare frameworks', text: 'IFRS, FRS 102, FRS 105, AASB' },
  { to: '/practice', icon: GraduationCap, title: 'Practice', text: 'Quizzes, flashcards, coding' },
];

export function Home() {
  const { progress } = useProgress();
  const last = progress.lastDoc ? findDoc(progress.lastDoc) : undefined;
  const readCount = Object.keys(progress.read).length;
  const today = todayIso();
  const due = flashcards.filter((c) => isDue(progress.cards[c.id], today)).length;

  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-wide text-accent">Australian & UK bookkeeping</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Learn how the books work in Australia and the UK, then practise it.</h1>
        <p className="mt-4 text-lg text-muted">
          GST and the BAS, VAT and Making Tax Digital, payroll, company law and the accounting standards, with a journal simulator, calculators, quizzes and
          real-looking bills to code.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to={last ? `/learn/${last.id}` : `/learn/${docs[0]?.id ?? ''}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-5 font-medium text-accent-fg hover:bg-accent-hover"
          >
            {last ? `Continue: ${last.title}` : 'Start with double entry'} <ArrowRight size={16} aria-hidden />
          </Link>
          <Link to="/practice/flashcards" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-5 font-medium hover:bg-panel-2">
            {due} flashcards due
          </Link>
        </div>
        <p className="mt-3 text-sm text-muted">
          {readCount} of {docs.length} topics read
        </p>
      </section>

      <section aria-labelledby="paths">
        <h2 id="paths" className="mb-4 text-xl font-semibold">
          Learning paths
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => {
            const items = docsIn(s.id);
            const done = items.filter((d) => progress.read[d.id]).length;
            const pct = items.length ? Math.round((done / items.length) * 100) : 0;
            return (
              <Card key={s.id}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold">
                    <Link to={`/learn#${s.id}`} className="hover:text-accent">
                      {s.title}
                    </Link>
                  </h3>
                  <span className="num text-sm text-muted">
                    {done}/{items.length}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{s.blurb}</p>
                <div className="mt-3 h-1.5 rounded-full bg-panel-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.title} progress`}>
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
                <ol className="mt-4 space-y-1 text-sm">
                  {items.map((d) => (
                    <li key={d.id}>
                      <Link to={`/learn/${d.id}`} className={cx('hover:text-accent', progress.read[d.id] ? 'text-muted line-through decoration-1' : '')}>
                        {d.title}
                      </Link>
                    </li>
                  ))}
                </ol>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="quick">
        <h2 id="quick" className="mb-4 text-xl font-semibold">
          Jump in
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quick.map((q) => (
            <Link key={q.to} to={q.to} className="group rounded-xl border border-line bg-panel p-4 hover:border-accent">
              <q.icon size={20} className="text-accent" aria-hidden />
              <p className="mt-2 font-medium group-hover:text-accent">{q.title}</p>
              <p className="text-sm text-muted">{q.text}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
