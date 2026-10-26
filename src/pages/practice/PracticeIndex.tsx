import { useState } from 'react';
import { Link } from 'react-router-dom';
import { docs } from '../../content/docs';
import { codingScenarios, flashcards, quizzes } from '../../data';
import { useProgress } from '../../progress/ProgressContext';
import { isDue, todayIso } from '../../utils/srs';
import { Button, Card, JurisdictionBadge, PageHeader } from '../../components/ui';

export function PracticeIndex() {
  const { progress, reset } = useProgress();
  const [confirming, setConfirming] = useState(false);
  const today = todayIso();
  const due = flashcards.filter((c) => isDue(progress.cards[c.id], today)).length;
  return (
    <div className="space-y-8">
      <PageHeader title="Practice" lead="Test yourself on each topic, review flashcards, and code real-looking bills." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/practice/flashcards" className="rounded-xl border border-line bg-panel p-5 hover:border-accent">
          <p className="font-semibold">Flashcards</p>
          <p className="mt-1 text-sm text-muted">
            {flashcards.length} cards · <span className="font-medium text-ink">{due} due today</span>
          </p>
        </Link>
        <Link to="/practice/coding" className="rounded-xl border border-line bg-panel p-5 hover:border-accent">
          <p className="font-semibold">Coding scenarios</p>
          <p className="mt-1 text-sm text-muted">
            {codingScenarios.length} bills and bank lines to code with an account and a GST or VAT rate.
          </p>
        </Link>
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Quizzes</h2>
        <ul className="divide-y divide-line">
          {docs.map((d) => {
            const n = quizzes.filter((q) => q.doc === d.id).length;
            const best = progress.quiz[d.id];
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <JurisdictionBadge j={d.jurisdiction} />
                  <Link to={`/practice/quiz/${d.id}`} className="font-medium hover:text-accent">
                    {d.title}
                  </Link>
                </div>
                <span className="num text-sm text-muted">{best ? `best ${best.best}/${best.total}` : `${n} questions`}</span>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <Button className="bg-bad text-white hover:bg-bad" onClick={() => { reset(); setConfirming(false); }}>
              Yes, erase practice data
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(true)}>Reset practice data</Button>
        )}
        <p className="text-sm text-muted">Quiz scores, flashcard boxes, solved journals and checklist ticks are kept in this browser only.</p>
      </div>
    </div>
  );
}
