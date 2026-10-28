import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { docs, findDoc } from '../../content/docs';
import { flashcards } from '../../data';
import { useProgress } from '../../progress/ProgressContext';
import { BOX_INTERVAL_DAYS, isDue, review, todayIso } from '../../utils/srs';
import { Button, Card, Field, inputClass, PageHeader } from '../../components/ui';
import { useHubScope } from '../../lib/hubScope';
import { inScope } from '../../lib/scope';

export function FlashcardsPage() {
  const [params, setParams] = useSearchParams();
  const docFilter = params.get('doc') ?? '';
  const [includeAll, setIncludeAll] = useState(false);
  const { progress, update } = useProgress();
  const { scope } = useHubScope();
  const pool = flashcards.filter((c) => inScope(c.jurisdiction, scope));
  const today = todayIso();

  // The queue is built only when the deck or mode changes, so answering a card does not reshuffle the session.
  const build = (doc: string, all: boolean) =>
    pool.filter((c) => (doc === '' || c.doc === doc) && (all || isDue(progress.cards[c.id], today))).map((c) => c.id);
  const [queue, setQueue] = useState<string[]>(() => build(docFilter, false));
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionRight, setSessionRight] = useState(0);

  const reset = (doc: string, all: boolean) => {
    setQueue(build(doc, all));
    setPosition(0);
    setRevealed(false);
    setSessionRight(0);
  };
  const card = pool.find((c) => c.id === queue[position]);
  const state = card ? progress.cards[card.id] : undefined;

  const grade = (correct: boolean) => {
    if (!card) return;
    update((p) => ({ ...p, cards: { ...p.cards, [card.id]: review(p.cards[card.id], correct, today) } }));
    if (correct) setSessionRight((n) => n + 1);
    setRevealed(false);
    setPosition((n) => n + 1);
  };

  const deckSize = pool.filter((c) => docFilter === '' || c.doc === docFilter).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Flashcards" lead="Spaced repetition: a card you know comes back after 1, 3, 7, 14, then 30 days. One you miss comes back tomorrow." />
      <Card className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Deck">
          <select
            className={inputClass}
            value={docFilter}
            onChange={(e) => {
              setParams(e.target.value ? { doc: e.target.value } : {});
              reset(e.target.value, includeAll);
            }}
          >
            <option value="">All topics ({pool.length} cards)</option>
            {docs.filter((d) => inScope(d.jurisdiction, scope)).map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            checked={includeAll}
            onChange={(e) => {
              setIncludeAll(e.target.checked);
              reset(docFilter, e.target.checked);
            }}
          />
          Include cards not due yet
        </label>
      </Card>

      {card ? (
        <Card>
          <div className="flex justify-between text-sm text-muted">
            <span>
              Card {position + 1} of {queue.length}
            </span>
            <span>{state ? `Box ${state.box}` : 'New'}</span>
          </div>
          <p className="mt-1 text-xs text-muted">{findDoc(card.doc)?.title}</p>
          <p className="mt-6 text-center text-xl font-semibold">{card.front}</p>
          <div className="mt-6 min-h-16 text-center" aria-live="polite">
            {revealed && <p className="text-lg">{card.back}</p>}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {revealed ? (
              <>
                <Button variant="secondary" onClick={() => grade(false)}>
                  Not yet (back to box 1)
                </Button>
                <Button onClick={() => grade(true)}>
                  I knew it (next in {BOX_INTERVAL_DAYS[Math.min(5, (state?.box ?? 0) + 1)]} days)
                </Button>
              </>
            ) : (
              <Button onClick={() => setRevealed(true)}>Show answer</Button>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <p className="font-medium">{queue.length === 0 ? 'Nothing due in this deck today.' : `Session done: ${sessionRight} of ${queue.length} known.`}</p>
          <p className="mt-1 text-sm text-muted">
            {deckSize} cards in this deck. Tick "Include cards not due yet" to practise them anyway.
          </p>
        </Card>
      )}
    </div>
  );
}
