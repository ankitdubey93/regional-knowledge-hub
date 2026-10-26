import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { findDoc } from '../../content/docs';
import { quizzes } from '../../data';
import { Quiz } from '../../components/Quiz';
import { Button, PageHeader, TextLink } from '../../components/ui';
import { useProgress } from '../../progress/ProgressContext';
import { NotFound } from '../NotFound';

export function QuizPage() {
  const { section, slug } = useParams();
  const id = `${section}/${slug}`;
  const doc = findDoc(id);
  const [attempt, setAttempt] = useState(0);
  const { progress } = useProgress();
  const questions = quizzes.filter((q) => q.doc === id);
  if (!doc || questions.length === 0) return <NotFound />;
  const best = progress.quiz[id];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={`Quiz: ${doc.title}`}
        lead={
          <>
            {questions.length} questions. <TextLink to={`/learn/${doc.id}`}>Read the topic</TextLink> first if you have not.
            {best && ` Best so far: ${best.best}/${best.total}.`}
          </>
        }
      />
      <Quiz key={attempt} docId={id} questions={questions} attempt={attempt} />
      <Button variant="secondary" onClick={() => setAttempt((a) => a + 1)}>
        Start again
      </Button>
    </div>
  );
}
