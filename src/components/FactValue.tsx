import { fact, factStatus, formatFact, UnknownFactError } from '../data/facts';
import { todayIso } from '../utils/srs';
import { cx } from './ui';

/**
 * A figure from the facts registry, shown with how sure we are of it. The
 * link goes to the official source; the title says when it was last checked.
 */
export function FactValue({ factKey }: { factKey: string }) {
  let f;
  try {
    f = fact(factKey);
  } catch (e) {
    if (e instanceof UnknownFactError) return <span className="rounded bg-bad-soft px-1 text-bad">[unknown fact {factKey}]</span>;
    throw e;
  }
  const status = factStatus(f, todayIso());
  const title =
    status === 'unverified'
      ? `${f.label}. Not yet checked against the source.`
      : `${f.label}. Checked ${f.verifiedOn}${status === 'stale' ? ', over a year ago' : ''}. Effective from ${f.effectiveFrom}.`;
  return (
    <a
      href={f.source}
      target="_blank"
      rel="noreferrer"
      title={title}
      data-fact={factKey}
      className={cx(
        'rounded px-1 font-semibold no-underline',
        // Short figures stay on one line; long text facts (e.g. a list of due dates) must wrap on phones.
        f.unit !== 'text' && 'whitespace-nowrap',
        status === 'verified' && 'bg-accent-soft text-ink',
        status === 'stale' && 'bg-warn-soft text-ink',
        status === 'unverified' && 'bg-warn-soft text-ink',
      )}
    >
      {formatFact(f)}
      {status !== 'verified' && <span className="ml-1 text-xs font-medium text-warn">({status})</span>}
    </a>
  );
}
