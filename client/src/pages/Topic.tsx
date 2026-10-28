import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { docs, findDoc, SECTIONS } from '../content/docs';
import { isToolId, TOOLS } from '../content/tools';
import { checklists, flashcards, quizzes } from '../data';
import { Markdown } from '../components/Markdown';
import { FactValue } from '../components/FactValue';
import { Checklist } from '../components/Checklist';
import { Callout, Card, JurisdictionBadge, TextLink } from '../components/ui';
import { useProgress } from '../progress/ProgressContext';
import { fact } from '../data/facts';
import { useHubScope } from '../lib/hubScope';
import { inScope, scopeName } from '../lib/scope';
import { NotFound } from './NotFound';

export function Topic() {
  const { section, slug } = useParams();
  const id = `${section}/${slug}`;
  const doc = findDoc(id);
  const { progress } = useProgress();
  const { scope, entity, entityScope } = useHubScope();

  useEffect(() => {
    if (doc) document.title = `${doc.title} · Compliance Hub`;
  }, [doc]);

  if (!doc) return <NotFound />;

  const scopedDocs = docs.filter((d) => d.id === id || inScope(d.jurisdiction, scope));
  const index = scopedDocs.findIndex((d) => d.id === id);
  const prev = scopedDocs[index - 1];
  const next = scopedDocs[index + 1];
  const quizCount = quizzes.filter((q) => q.doc === doc.id).length;
  const cardCount = flashcards.filter((c) => c.doc === doc.id).length;
  const best = progress.quiz[doc.id];
  const list = checklists.find((c) => c.doc === doc.id);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <article className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted">
          <Link to="/knowledge/learn" className="hover:text-accent">
            Learn
          </Link>{' '}
          / <Link to={`/knowledge/learn#${doc.section}`} className="hover:text-accent">{SECTIONS.find((x) => x.id === doc.section)?.title}</Link>
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <JurisdictionBadge j={doc.jurisdiction} />
          <span className="text-sm text-muted">
            {doc.level} · {doc.minutes} min read
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{doc.title}</h1>
        <p className="mt-2 text-lg text-muted">{doc.summary}</p>
        {entity !== null && entityScope !== null && !inScope(doc.jurisdiction, entityScope) && (
          <div className="mt-4">
            <Callout tone="warn">
              This topic is for {doc.jurisdiction === 'AU' ? 'Australia' : 'the UK'}. {entity.name} is set up for {scopeName(entityScope)}.
            </Callout>
          </div>
        )}

        <div className="mt-6">
          <Markdown body={doc.body} />
        </div>

        {list && (
          <div className="mt-8">
            <Checklist list={list} />
          </div>
        )}

        <nav aria-label="Next and previous topics" className="mt-8 grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
          {prev ? (
            <Link to={`/knowledge/learn/${prev.id}`} className="rounded-lg border border-line p-3 hover:border-accent">
              <span className="flex items-center gap-1 text-xs text-muted">
                <ArrowLeft size={14} aria-hidden /> Previous
              </span>
              {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link to={`/knowledge/learn/${next.id}`} className="rounded-lg border border-line p-3 text-right hover:border-accent">
              <span className="flex items-center justify-end gap-1 text-xs text-muted">
                Next <ArrowRight size={14} aria-hidden />
              </span>
              {next.title}
            </Link>
          )}
        </nav>
      </article>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <h2 className="font-semibold">Practise this</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {quizCount > 0 && (
              <li>
                <TextLink to={`/knowledge/practice/quiz/${doc.id}`}>Quiz ({quizCount} questions)</TextLink>
                {best && (
                  <span className="text-muted">
                    {' '}
                    · best {best.best}/{best.total}
                  </span>
                )}
              </li>
            )}
            {cardCount > 0 && (
              <li>
                <TextLink to={`/knowledge/practice/flashcards?doc=${encodeURIComponent(doc.id)}`}>Flashcards ({cardCount})</TextLink>
              </li>
            )}
            {doc.tools.filter(isToolId).filter((t) => t !== 'checklist').map((t) => (
              <li key={t}>
                <TextLink to={TOOLS[t].to}>{TOOLS[t].title}</TextLink>
              </li>
            ))}
          </ul>
        </Card>
        {doc.facts.length > 0 && (
          <Card>
            <h2 className="font-semibold">Key figures</h2>
            <dl className="mt-3 space-y-3 text-sm">
              {doc.facts.map((k) => (
                <div key={k}>
                  <dt className="text-muted">{fact(k).label}</dt>
                  <dd className="mt-0.5">
                    <FactValue factKey={k} />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted">Each figure links to its official source. Hover or long-press for the date it was checked.</p>
          </Card>
        )}
      </aside>
    </div>
  );
}
