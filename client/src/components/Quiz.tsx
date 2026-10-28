import { useMemo, useState } from 'react';
import type { QuizQuestion } from '@chub/shared/data/schemas';
import { seededOrder } from '../utils/shuffle';
import { useProgress } from '../progress/ProgressContext';
import { Button, Card, cx } from './ui';

/**
 * One question at a time. After an answer, every option shows why it is right
 * or wrong, because the wrong answers are where the learning is.
 */
export function Quiz({ docId, questions, attempt }: { docId: string; questions: QuizQuestion[]; attempt: number }) {
  const { update } = useProgress();
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const q = questions[index];
  const order = useMemo(() => (q ? seededOrder(q.options.length, `${q.id}:${attempt}`) : []), [q, attempt]);

  if (finished) {
    return (
      <Card>
        <p className="text-sm text-muted">Finished</p>
        <p className="num mt-1 text-3xl font-semibold" aria-live="polite">
          {score} / {questions.length}
        </p>
        <p className="mt-2 text-muted">{score === questions.length ? 'Every one right.' : 'Read the explanations for the ones you missed, then try again: the options are reshuffled.'}</p>
      </Card>
    );
  }
  if (!q) return null;

  const answer = (optionIndex: number) => {
    if (chosen !== null) return;
    setChosen(optionIndex);
    if (optionIndex === q.answer) setScore((s) => s + 1);
  };

  const next = () => {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setChosen(null);
      return;
    }
    const final = score;
    update((p) => {
      const prev = p.quiz[docId];
      const best = Math.max(prev?.best ?? 0, final);
      return { ...p, quiz: { ...p.quiz, [docId]: { best, total: questions.length, last: new Date().toISOString().slice(0, 10) } } };
    });
    setFinished(true);
  };

  return (
    <Card>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Question {index + 1} of {questions.length}
        </span>
        <span className="num">Score {score}</span>
      </div>
      <h2 className="mt-3 text-lg font-semibold" id={`q-${q.id}`}>
        {q.question}
      </h2>
      <ul className="mt-4 space-y-2" role="list" aria-labelledby={`q-${q.id}`}>
        {order.map((oi) => {
          const o = q.options[oi]!;
          const isAnswer = oi === q.answer;
          const isChosen = oi === chosen;
          return (
            <li key={oi}>
              <button
                type="button"
                onClick={() => answer(oi)}
                disabled={chosen !== null}
                aria-pressed={isChosen}
                className={cx(
                  'w-full rounded-lg border p-3 text-left disabled:cursor-default',
                  chosen === null && 'border-line hover:border-accent hover:bg-panel-2',
                  chosen !== null && isAnswer && 'border-good bg-good-soft',
                  chosen !== null && isChosen && !isAnswer && 'border-bad bg-bad-soft',
                  chosen !== null && !isAnswer && !isChosen && 'border-line opacity-80',
                )}
              >
                <span className="font-medium">{o.text}</span>
                {chosen !== null && (
                  <span className="mt-1 block text-sm">
                    {isAnswer ? 'Correct. ' : isChosen ? 'Not quite. ' : ''}
                    {o.why}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {chosen !== null && (
        <div className="mt-4 flex justify-end">
          <Button onClick={next}>{index + 1 < questions.length ? 'Next question' : 'See my score'}</Button>
        </div>
      )}
    </Card>
  );
}
