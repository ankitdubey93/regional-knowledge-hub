import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Pencil, Plus, Send, Square, Trash2 } from 'lucide-react';
import { ApiError } from '../lib/api';
import {
  attachDocument,
  createConversation,
  deleteConversation,
  detachDocument,
  getChatStatus,
  getConversation,
  listConversations,
  renameConversation,
  streamMessage,
} from '../lib/chat';
import type { AttachedDocument, ChatMessageView as Msg, ChatScope, ChatStatus, CitationView, ConversationView } from '../lib/chatWire';
import { listDocuments, type DocumentView } from '../lib/documents';
import { ChatMessageView } from './chat/ChatMessageView';
import { Button, Callout, Card, cx, inputClass, TextLink } from './ui';

const NOT_CONFIGURED_TEXT = "The assistant isn't configured on this server.";
const DELETE_CONFIRM = 'Delete this chat? This cannot be undone.';

function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Try again.';
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

// Saved chats and streamed, cited answers. Nothing is stored in the browser (Hard rule 13); answers come only from the knowledge base (Hard rule 12).
export function ChatPanel({ title, lead, contextLine, placeholder, suggestions, clientId, scope }: {
  title: string; lead?: string; contextLine?: string; placeholder: string; suggestions: string[];
  clientId: string | null; scope: ChatScope | null;
}) {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [chats, setChats] = useState<ConversationView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState<{ text: string; sources: CitationView[] } | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [attached, setAttached] = useState<AttachedDocument[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<DocumentView[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The chat on screen now, read after an await so a late attach/detach reply can't land on another chat.
  const activeRef = useRef<string | null>(null);
  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);
  const id = useId();

  const refreshChats = useCallback(async () => {
    try {
      setChats(await listConversations(clientId));
    } catch (err) {
      setError(errorText(err));
    }
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setStreaming(null);
    setRenamingId(null);
    setError(null);
    setAttached([]);
    setLibraryOpen(false);
    setLibrary(null);
    getChatStatus().then(
      (s) => { if (!cancelled) setStatus(s); },
      (err: unknown) => { if (!cancelled) setError(errorText(err)); },
    );
    listConversations(clientId).then(
      (list) => { if (!cancelled) setChats(list); },
      (err: unknown) => { if (!cancelled) setError(errorText(err)); },
    );
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [clientId, scope]);

  async function openChat(chatId: string) {
    setError(null);
    try {
      const detail = await getConversation(chatId);
      setActiveId(chatId);
      setMessages(detail.messages);
      setAttached(detail.conversation.documents);
      setLibraryOpen(false);
    } catch (err) {
      setError(errorText(err));
    }
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setAttached([]);
    setLibraryOpen(false);
    setError(null);
  }

  async function removeChat(chat: ConversationView) {
    if (!window.confirm(DELETE_CONFIRM)) return;
    try {
      await deleteConversation(chat.id);
      setChats((list) => list.filter((c) => c.id !== chat.id));
      if (activeId === chat.id) {
        setActiveId(null);
        setMessages([]);
        setAttached([]);
        setLibraryOpen(false);
      }
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function saveRename(chatId: string) {
    const next = renameDraft.trim();
    if (next === '') return;
    try {
      const updated = await renameConversation(chatId, next);
      setChats((list) => list.map((c) => (c.id === chatId ? updated : c)));
      setRenamingId(null);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function toggleLibrary() {
    if (libraryOpen) {
      setLibraryOpen(false);
      return;
    }
    setLibraryOpen(true);
    if (clientId === null) return;
    try {
      setLibrary(await listDocuments(clientId));
    } catch (err) {
      setError(errorText(err));
    }
  }

  function closeLibrary() {
    setLibraryOpen(false);
    document.getElementById(`${id}-attach`)?.focus();
  }

  async function chooseDocument(doc: DocumentView) {
    const chatId = activeId;
    if (chatId === null) return;
    setError(null);
    try {
      const next = await attachDocument(chatId, doc.id);
      if (activeRef.current !== chatId) return;
      setAttached(next);
      closeLibrary();
    } catch (err) {
      if (activeRef.current === chatId) setError(errorText(err));
    }
  }

  async function removeAttached(doc: AttachedDocument) {
    const chatId = activeId;
    if (chatId === null) return;
    setError(null);
    try {
      const next = await detachDocument(chatId, doc.id);
      if (activeRef.current === chatId) setAttached(next);
    } catch (err) {
      if (activeRef.current === chatId) setError(errorText(err));
    }
  }

  async function send() {
    const text = draft.trim();
    if (text === '' || streaming !== null || status?.configured === false) return;
    setError(null);
    setDraft('');
    setStreaming({ text: '', sources: [] });
    const controller = new AbortController();
    abortRef.current = controller;
    let chatId = activeId;
    try {
      if (chatId === null) {
        const created = await createConversation({ clientId, scope });
        chatId = created.id;
        setChats((list) => [created, ...list]);
        setActiveId(created.id);
      }
      await streamMessage(
        chatId,
        text,
        {
          onStart: (m) => setMessages((list) => [...list, m]),
          onSources: (s) => setStreaming((cur) => (cur === null ? cur : { ...cur, sources: s })),
          onDelta: (t) => setStreaming((cur) => (cur === null ? cur : { ...cur, text: cur.text + t })),
          onDone: (m) => {
            setMessages((list) => [...list, m]);
            setStreaming(null);
            void refreshChats();
          },
          onError: (message) => setError(message),
        },
        controller.signal,
      );
    } catch (err) {
      if (isAbort(err)) {
        if (chatId !== null) {
          try {
            const detail = await getConversation(chatId);
            setMessages(detail.messages);
          } catch (reloadErr) {
            setError(errorText(reloadErr));
          }
          void refreshChats();
        }
      } else {
        setError(errorText(err));
      }
    } finally {
      setStreaming(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  const notConfigured = status?.configured === false;
  const busy = streaming !== null;

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {lead && <p className="mt-1 text-sm text-muted">{lead}</p>}
      {contextLine && <p className="mt-1 text-xs text-muted">{contextLine}</p>}

      <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Saved chats" className="min-w-0">
          <Button variant="secondary" className="w-full" onClick={newChat}>
            <Plus size={16} aria-hidden />
            New chat
          </Button>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto lg:max-h-[24rem]">
            {chats.map((c) => (
              <li key={c.id} className="min-w-0">
                {renamingId === c.id ? (
                  <form
                    className="flex flex-col gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveRename(c.id);
                    }}
                  >
                    <label htmlFor={`${id}-rename-${c.id}`} className="sr-only">Chat title</label>
                    <input
                      id={`${id}-rename-${c.id}`}
                      className={inputClass}
                      value={renameDraft}
                      maxLength={120}
                      onChange={(e) => setRenameDraft(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button type="submit" className="min-h-9 px-3" disabled={renameDraft.trim() === ''}>Save</Button>
                      <Button variant="secondary" className="min-h-9 px-3" onClick={() => setRenamingId(null)}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      aria-current={activeId === c.id ? 'true' : undefined}
                      className={cx(
                        'min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-panel-2',
                        activeId === c.id && 'bg-accent-soft font-medium',
                      )}
                      onClick={() => void openChat(c.id)}
                    >
                      {c.title}
                    </button>
                    <button
                      type="button"
                      aria-label={`Rename chat ${c.title}`}
                      className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-ink"
                      onClick={() => {
                        setRenamingId(c.id);
                        setRenameDraft(c.title);
                      }}
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete chat ${c.title}`}
                      className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-ink"
                      onClick={() => void removeChat(c)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <div role="log" aria-live="polite" aria-label={`${title} conversation`} className="max-h-[28rem] min-h-32 space-y-3 overflow-y-auto">
            {messages.length === 0 && !busy ? (
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
              <>
                {messages.map((m) => (
                  <ChatMessageView key={m.id} message={m} />
                ))}
                {streaming !== null && (
                  <ChatMessageView
                    streaming
                    message={{
                      id: 'streaming',
                      role: 'assistant',
                      body: streaming.text,
                      status: 'answered',
                      flags: [],
                      createdAt: '',
                      citations: [],
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {notConfigured && <Callout tone="warn">{NOT_CONFIGURED_TEXT}</Callout>}
      {error !== null && <Callout tone="bad">{error}</Callout>}

      {clientId !== null && activeId !== null && (
        <div
          className="flex flex-col gap-2"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && libraryOpen) closeLibrary();
          }}
        >
          {attached.length > 0 && (
            <ul aria-label="Attached documents" className="flex flex-wrap gap-2">
              {attached.map((d) => (
                <li
                  key={d.id}
                  className="flex min-w-0 max-w-full items-center gap-1 rounded-full border border-line bg-panel-2 px-3 py-1 text-sm"
                >
                  <span className="min-w-0 break-all">{d.originalName}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${d.originalName}`}
                    className="rounded-full px-1.5 text-muted hover:text-ink"
                    onClick={() => void removeAttached(d)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button id={`${id}-attach`} variant="secondary" aria-expanded={libraryOpen} onClick={() => void toggleLibrary()}>
              Attach document
            </Button>
          </div>
          {libraryOpen && (
            <div role="group" aria-label="Choose a document" className="flex flex-col gap-2 rounded-lg border border-line p-3">
              {library !== null && library.length === 0 && (
                <>
                  <p className="text-sm text-muted">No documents yet.</p>
                  <div>
                    <TextLink to={`/entities/${clientId}/documents`}>Upload one</TextLink>
                  </div>
                </>
              )}
              {library !== null && library.length > 0 && library.every((d) => attached.some((a) => a.id === d.id)) && (
                <>
                  <p className="text-sm text-muted">Every document for this entity is already attached.</p>
                  <div>
                    <TextLink to={`/entities/${clientId}/documents`}>Upload another</TextLink>
                  </div>
                </>
              )}
              {library !== null && library.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {library
                    .filter((d) => !attached.some((a) => a.id === d.id))
                    .map((d) => (
                      <li key={d.id} className="min-w-0 max-w-full">
                        <button
                          type="button"
                          className="max-w-full break-all rounded-full border border-line bg-panel-2 px-3 py-1.5 text-left text-sm hover:border-accent"
                          onClick={() => void chooseDocument(d)}
                        >
                          {d.originalName}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
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
              void send();
            }
          }}
        />
        {busy ? (
          <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
            <Square size={16} aria-hidden />
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={draft.trim() === '' || notConfigured}>
            <Send size={16} aria-hidden />
            Send
          </Button>
        )}
      </form>

      <p className="text-xs text-muted">Answers come only from the Knowledge Hub, with citations. Check anything you'll rely on.</p>
    </Card>
  );
}
