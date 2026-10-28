import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessageView as Msg } from '@chub/shared/lib/chatWire';
import { flagText, linkMarkers, statusBadge } from '../../lib/chat';
import { TextLink } from '../ui';

const EMPTY_BODY: Partial<Record<Msg['status'], string>> = {
  refused: 'The assistant declined to answer this question.',
  error: "The answer didn't finish. Try again.",
};

export function ChatMessageView({ message, streaming }: { message: Msg; streaming?: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-accent-soft px-3 py-2 text-sm">
        {message.body}
      </div>
    );
  }

  const badge = statusBadge(message.status);
  const emptyText = message.body.trim() === '' ? EMPTY_BODY[message.status] : undefined;

  return (
    <div className="mr-auto w-fit max-w-[85%] min-w-0 break-words rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">
      {badge !== null && (
        <span className="mb-1 inline-flex rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium">{badge}</span>
      )}
      {emptyText !== undefined ? (
        <p>{emptyText}</p>
      ) : (
        <div className="prose-doc break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
            {linkMarkers(message.body, message.id)}
          </ReactMarkdown>
        </div>
      )}
      {message.flags.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-muted">
          {message.flags.map((f, i) => (
            <li key={`${f.code}-${i}`}>{flagText(f)}</li>
          ))}
        </ul>
      )}
      {message.citations.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold">Sources</h3>
          <ol className="mt-1 space-y-2 text-xs">
            {message.citations.map((c) => {
              const href = c.sitePath ?? (c.sourceId === null ? null : `/knowledge/laws/${c.sourceId}`);
              return (
                <li key={c.marker} id={`cite-${message.id}-${c.marker}`} className="min-w-0 break-words">
                  <span className="font-semibold">[{c.marker}]</span>{' '}
                  {href !== null ? <TextLink to={href}>{c.title}</TextLink> : <span>{c.title}</span>}{' '}
                  <span className="text-muted">{c.citation}</span>
                  {c.kind === 'bill' && (
                    <span className="ml-2 inline-flex rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium">Bill: not law</span>
                  )}
                  {c.kind === 'ledger' && (
                    <span className="ml-2 inline-flex rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium">Your books: as imported, not reviewed</span>
                  )}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-muted">Excerpt</summary>
                    <p className="whitespace-pre-wrap break-words">{c.excerpt}</p>
                  </details>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {streaming && <span className="sr-only">Answer in progress</span>}
    </div>
  );
}
