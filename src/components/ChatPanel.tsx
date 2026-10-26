import { useId, useState } from 'react';
import { Send } from 'lucide-react';
import { appendExchange, type ChatMessage } from '../lib/chat';
import { Button, Card, cx, inputClass } from './ui';

// UI only. Sending adds the question and the fixed not-connected reply. No network, no storage (Hard rules 12 and 13).
export function ChatPanel({ title, lead, contextLine, placeholder, suggestions }: {
  title: string; lead?: string; contextLine?: string; placeholder: string; suggestions: string[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const id = useId();

  function send() {
    setMessages((m) => appendExchange(m, draft, () => crypto.randomUUID()));
    setDraft('');
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {lead && <p className="mt-1 text-sm text-muted">{lead}</p>}
      {contextLine && <p className="mt-1 text-xs text-muted">{contextLine}</p>}

      <div role="log" aria-live="polite" aria-label={`${title} conversation`} className="max-h-[28rem] min-h-32 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <>
            <p className="text-sm text-muted">Try one of these:</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    className="rounded-full border border-line bg-panel-2 px-3 py-1.5 text-left text-sm hover:border-accent"
                    onClick={() => setDraft(s)}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-accent-soft px-3 py-2 text-sm">
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="mr-auto w-fit max-w-[85%] rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">
                {m.notConnected && (
                  <span className="mb-1 inline-flex rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium">Not connected</span>
                )}
                <p>{m.text}</p>
              </div>
            ),
          )
        )}
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={id} className="sr-only">Your question</label>
        <textarea
          id={id}
          rows={2}
          className={cx(inputClass, 'resize-y')}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button type="submit" disabled={draft.trim() === ''}>
          <Send size={16} aria-hidden />
          Send
        </Button>
      </form>

      <p className="text-xs text-muted">Answers will come only from the Knowledge Hub, with citations. The assistant is not connected yet.</p>
    </Card>
  );
}
