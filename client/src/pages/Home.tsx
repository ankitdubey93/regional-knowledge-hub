import { Link } from 'react-router-dom';
import { ArrowRight, Calculator, GraduationCap, Scale, Shuffle } from 'lucide-react';
import { docs, docsIn, SECTIONS } from '../content/docs';
import { useProgress } from '../progress/ProgressContext';
import { Card } from '../components/ui';
import { flashcards } from '../data';
import { isDue, todayIso } from '../utils/srs';

const quick = [
  { to: '/knowledge/tools/journal', icon: Shuffle, title: 'Journal simulator', text: 'Post entries, see T-accounts' },
  { to: '/knowledge/tools/tax', icon: Calculator, title: 'Tax calculator', text: 'BAS, VAT return, super, NIC' },
  { to: '/knowledge/compare', icon: Scale, title: 'Compare frameworks', text: 'IFRS, FRS 102, FRS 105, AASB' },
  { to: '/knowledge/practice', icon: GraduationCap, title: 'Practice', text: 'Quizzes, flashcards, coding' },
];

export function Home() {
  const { progress } = useProgress();
  const today = todayIso();
  const due = flashcards.filter((c) => isDue(progress.cards[c.id], today)).length;

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-[40px] bg-sun-soft px-6 py-12 sm:px-16 sm:py-20">
        <span aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-64 rounded-full bg-peach-soft" />
        <span aria-hidden className="pointer-events-none absolute right-52 bottom-14 hidden size-28 rounded-full bg-accent-soft sm:block" />
        <span aria-hidden className="pointer-events-none absolute top-36 right-28 hidden size-16 rounded-full bg-uk-soft sm:block" />
        <div className="relative max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-accent">Australian & UK bookkeeping</p>
        <h1 className="mt-4 text-[34px] leading-[40px] font-semibold tracking-tight text-balance sm:text-[56px] sm:leading-[64px]">Learn how the books work in Australia and the UK, then practise it.</h1>
        <p className="mt-5 text-lg leading-8">
          GST and the BAS, VAT and Making Tax Digital, payroll, company law and the accounting standards, with a journal simulator, calculators, quizzes and
          real-looking bills to code.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to={`/knowledge/learn/${docs[0]?.id ?? ''}`}
            className="group inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-6 font-semibold text-accent-fg transition-[background-color,transform,box-shadow] duration-150 ease-snappy hover:-translate-y-px hover:bg-accent-hover hover:shadow-btn active:scale-[0.97] motion-reduce:transform-none"
          >
            Start with double entry <ArrowRight size={16} aria-hidden className="transition-transform duration-150 ease-snappy group-hover:translate-x-0.5" />
          </Link>
          <Link to="/knowledge/practice/flashcards" className="inline-flex min-h-12 items-center rounded-xl bg-panel px-6 font-semibold transition-colors duration-150 ease-snappy hover:bg-accent-soft hover:text-accent">
            {due} flashcards due
          </Link>
        </div>
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
                    <Link to={`/knowledge/learn#${s.id}`} className="hover:text-accent">
                      {s.title}
                    </Link>
                  </h3>
                </div>
                <p className="mt-1 text-sm text-muted">{s.blurb}</p>
                <ol className="mt-4 space-y-1 text-sm">
                  {items.map((d) => (
                    <li key={d.id}>
                      <Link to={`/knowledge/learn/${d.id}`} className="hover:text-accent">
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
            <Link key={q.to} to={q.to} className="group rounded-3xl bg-panel shadow-soft transition-[transform,box-shadow] duration-150 ease-snappy hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0 motion-reduce:transform-none p-5">
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
