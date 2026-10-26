import { Link } from 'react-router-dom';
import { ArrowRight, Calculator, GraduationCap, Scale, Shuffle } from 'lucide-react';
import { docs, docsIn, SECTIONS } from '../content/docs';
import { useProgress } from '../progress/ProgressContext';
import { Card } from '../components/ui';
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
            to={`/learn/${docs[0]?.id ?? ''}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-5 font-medium text-accent-fg hover:bg-accent-hover"
          >
            Start with double entry <ArrowRight size={16} aria-hidden />
          </Link>
          <Link to="/practice/flashcards" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-5 font-medium hover:bg-panel-2">
            {due} flashcards due
          </Link>
        </div>
      </section>

      <section aria-labelledby="paths">
        <h2 id="paths" className="mb-4 text-xl font-semibold">
          Learning paths
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => {
            const items = docsIn(s.id);
            return (
              <Card key={s.id}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold">
                    <Link to={`/learn#${s.id}`} className="hover:text-accent">
                      {s.title}
                    </Link>
                  </h3>
                </div>
                <p className="mt-1 text-sm text-muted">{s.blurb}</p>
                <ol className="mt-4 space-y-1 text-sm">
                  {items.map((d) => (
                    <li key={d.id}>
                      <Link to={`/learn/${d.id}`} className="hover:text-accent">
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
