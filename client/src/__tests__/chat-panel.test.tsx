import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { ChatMessageView as MessageView } from '../components/chat/ChatMessageView';
import type { ChatMessageView, CitationView, ConversationView } from '@chub/shared/lib/chatWire';
import type { DocumentView } from '../lib/documents';

const NOW = '2026-10-27T09:00:00.000Z';
const CONV_ID = 'conv-1';
const MESSAGES_KEY = `POST /api/conversations/${CONV_ID}/messages`;

const configuredStatus = { configured: true, provider: 'stub', model: 'stub-model', embeddings: false };

const conversation: ConversationView = {
  id: CONV_ID,
  clientId: null,
  scope: 'AU',
  title: 'New chat',
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
  documents: [],
};

const citation: CitationView = {
  marker: 1,
  sourceId: 'src-1',
  versionId: 'ver-1',
  chunkId: 'chunk-1',
  title: 'Levy Bill 2026',
  citation: 'Levy Bill 2026, s 9',
  kind: 'bill',
  jurisdiction: 'AU',
  billStatus: 'introduced',
  headingPath: [],
  provisionRef: null,
  sitePath: null,
  officialUrl: null,
  excerpt: 'Section 9 sets the levy.',
};

const userMessage: ChatMessageView = {
  id: 'm-user',
  role: 'user',
  body: 'What is the levy rate?',
  status: 'sent',
  flags: [],
  createdAt: NOW,
  citations: [],
};

const assistantMessage: ChatMessageView = {
  id: 'm-asst',
  role: 'assistant',
  body: 'The levy is 3.5% [1].',
  status: 'flagged',
  flags: [{ code: 'uncited', detail: 'No citations' }],
  createdAt: NOW,
  citations: [citation],
};

type Handler = (init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function sse(events: [string, unknown][]): string {
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** Routes every fetch by method and path; an unstubbed call fails the test loudly. */
function stubApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) throw new Error(`Unstubbed fetch: ${method} ${url.pathname}`);
    return handler(init ?? {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const baseRoutes: Record<string, Handler> = {
  'GET /api/chat/status': () => json(200, configuredStatus),
  'GET /api/conversations': () => json(200, { conversations: [] }),
  'POST /api/conversations': () => json(201, { conversation }),
};

function renderPanel() {
  return render(
    <MemoryRouter>
      <ChatPanel title="Ask the Knowledge Hub" placeholder="Ask" suggestions={[]} clientId={null} scope="AU" />
    </MemoryRouter>,
  );
}

describe('ChatPanel', () => {
  it('CP1 streams an answer with its citation and badge', async () => {
    const text = sse([
      ['start', { userMessage }],
      ['sources', { sources: [citation] }],
      ['delta', { text: 'The levy is 3.5% ' }],
      ['delta', { text: '[1].' }],
      ['done', { message: assistantMessage }],
    ]);
    // Split inside the sources event's JSON, so the first chunk ends mid-event.
    const cut = text.indexOf('data: {"sources"') + 10;
    const first = text.slice(0, cut);
    expect(first.endsWith('\n\n')).toBe(false);
    stubApi({
      ...baseRoutes,
      [MESSAGES_KEY]: () => streamResponse([first, text.slice(cut)]),
    });

    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByLabelText('Your question'), 'What is the levy rate?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    const log = screen.getByRole('log', { name: 'Ask the Knowledge Hub conversation' });
    expect(await within(log).findByText('Check this answer')).toBeInTheDocument();
    expect(within(log).getByText('What is the levy rate?')).toBeInTheDocument();
    expect(within(log).getByText(/The levy is 3\.5%/)).toBeInTheDocument();
    expect(within(log).getByRole('link', { name: '[1]' })).toHaveAttribute('href', '#cite-m-asst-1');
    expect(within(log).getByText('Sources')).toBeInTheDocument();
    expect(within(log).getByText('Bill: not law')).toBeInTheDocument();
    expect(within(log).getByText('Part of this answer has no citation.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your question')).toHaveValue('');
  });

  it('CP2 not configured disables Send', async () => {
    stubApi({
      ...baseRoutes,
      'GET /api/chat/status': () => json(200, { ...configuredStatus, configured: false }),
    });

    const user = userEvent.setup();
    renderPanel();
    expect(await screen.findByText("The assistant isn't configured on this server.")).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your question'), 'What is the levy rate?');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('CP3 a 429 shows the server\'s message', async () => {
    const limit = "You've reached today's limit of 50 questions. It resets at midnight UTC.";
    stubApi({
      ...baseRoutes,
      [MESSAGES_KEY]: () => json(429, { error: limit }),
    });

    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByLabelText('Your question'), 'What is the levy rate?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(limit)).toBeInTheDocument();
  });

  it('CP4 saved chats list and open', async () => {
    const saved: ConversationView = { ...conversation, id: 'conv-z', title: 'Zorbel question' };
    const detail = {
      conversation: saved,
      messages: [
        { ...userMessage, id: 'm-z-user', body: 'Zorbel question text' },
        { ...assistantMessage, id: 'm-z-asst', body: 'Zorbel answer text.', status: 'answered', flags: [], citations: [] },
      ],
    };
    const fetchMock = stubApi({
      ...baseRoutes,
      'GET /api/conversations': () => json(200, { conversations: [saved] }),
      'GET /api/conversations/conv-z': () => json(200, detail),
    });

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Zorbel question' }));
    expect(await screen.findByText('Zorbel question text')).toBeInTheDocument();
    expect(screen.getByText('Zorbel answer text.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/conversations/conv-z', expect.anything());
  });

  it('CP5 Stop aborts the stream', async () => {
    let signal: AbortSignal | undefined;
    stubApi({
      ...baseRoutes,
      'GET /api/conversations/conv-1': () => json(200, { conversation, messages: [] }),
      [MESSAGES_KEY]: (init) => {
        signal = init.signal ?? undefined;
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(sse([['start', { userMessage }], ['delta', { text: 'Partial ' }]])));
            // Never closes on its own; only the abort ends it.
            signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
          },
        });
        return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      },
    });

    const user = userEvent.setup();
    renderPanel();
    await user.type(screen.getByLabelText('Your question'), 'What is the levy rate?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const log = screen.getByRole('log', { name: 'Ask the Knowledge Hub conversation' });
    expect(await within(log).findByText(/Partial/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(signal?.aborted).toBe(true));
  });

  it('CP6 a ledger citation links to the report and carries the books badge', () => {
    const ledgerMessage: ChatMessageView = {
      id: 'm-ledger',
      role: 'assistant',
      body: 'Revenue was 30,000.00 [1].',
      status: 'answered',
      flags: [],
      createdAt: NOW,
      citations: [
        {
          marker: 1,
          sourceId: null,
          versionId: null,
          chunkId: null,
          title: 'Profit and loss',
          citation: 'Trial balance as at 2026-06-30, imported from Xero',
          kind: 'ledger',
          jurisdiction: 'AU',
          billStatus: null,
          headingPath: [],
          provisionRef: null,
          sitePath: '/entities/c1/reports?importId=i1&compareId=i0&tab=pnl',
          officialUrl: null,
          excerpt: 'x',
          ledger: { importId: 'i1', compareImportId: 'i0', report: 'pnl', asAt: '2026-06-30' },
        },
      ],
    };
    render(
      <MemoryRouter>
        <MessageView message={ledgerMessage} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Profit and loss' })).toHaveAttribute(
      'href',
      '/entities/c1/reports?importId=i1&compareId=i0&tab=pnl',
    );
    expect(screen.getByText('Your books: as imported, not reviewed')).toBeInTheDocument();
  });

  describe('attached documents (entity chats)', () => {
    const ENTITY_ID = 'client-1';
    const entityConversation: ConversationView = { ...conversation, clientId: ENTITY_ID, scope: null, title: 'Entity question' };
    const sales: DocumentView = {
      id: 'doc-1',
      clientId: ENTITY_ID,
      originalName: 'Sales.csv',
      kind: 'csv',
      byteSize: 2048,
      textChars: 40,
      truncated: false,
      uploadedBy: 'u1',
      requestId: null,
      supersedesId: null,
      fromClientLink: false,
      createdAt: NOW,
    };
    const engagement: DocumentView = { ...sales, id: 'doc-2', originalName: 'Engagement.pdf', kind: 'pdf' };
    const attachedSales = { id: 'doc-1', originalName: 'Sales.csv', kind: 'csv' as const, truncated: false };

    function renderEntityPanel() {
      return render(
        <MemoryRouter>
          <ChatPanel title="Ask about Acme" placeholder="Ask" suggestions={[]} clientId={ENTITY_ID} scope={null} />
        </MemoryRouter>,
      );
    }

    it('CP7 an entity chat shows Attach document and lists the entity\'s documents', async () => {
      stubApi({
        ...baseRoutes,
        'GET /api/conversations': () => json(200, { conversations: [entityConversation] }),
        'GET /api/conversations/conv-1': () => json(200, { conversation: entityConversation, messages: [] }),
        [`GET /api/clients/${ENTITY_ID}/documents`]: () => json(200, { documents: [sales, engagement] }),
      });

      const user = userEvent.setup();
      renderEntityPanel();
      await user.click(await screen.findByRole('button', { name: 'Entity question' }));
      const attach = await screen.findByRole('button', { name: 'Attach document' });
      expect(attach).toHaveAttribute('aria-expanded', 'false');
      await user.click(attach);
      expect(attach).toHaveAttribute('aria-expanded', 'true');
      const group = screen.getByRole('group', { name: 'Choose a document' });
      expect(within(group).getByRole('button', { name: 'Sales.csv' })).toBeInTheDocument();
      expect(within(group).getByRole('button', { name: 'Engagement.pdf' })).toBeInTheDocument();
    });

    it('CP8 choosing a document posts it and shows a chip', async () => {
      const fetchMock = stubApi({
        ...baseRoutes,
        'GET /api/conversations': () => json(200, { conversations: [entityConversation] }),
        'GET /api/conversations/conv-1': () => json(200, { conversation: entityConversation, messages: [] }),
        [`GET /api/clients/${ENTITY_ID}/documents`]: () => json(200, { documents: [sales] }),
        'POST /api/conversations/conv-1/documents': () => json(200, { documents: [attachedSales] }),
      });

      const user = userEvent.setup();
      renderEntityPanel();
      await user.click(await screen.findByRole('button', { name: 'Entity question' }));
      await user.click(await screen.findByRole('button', { name: 'Attach document' }));
      await user.click(within(screen.getByRole('group', { name: 'Choose a document' })).getByRole('button', { name: 'Sales.csv' }));

      const chips = screen.getByRole('list', { name: 'Attached documents' });
      expect(within(chips).getByText('Sales.csv')).toBeInTheDocument();
      expect(within(chips).getByRole('button', { name: 'Remove Sales.csv' })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Choose a document' })).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/conversations/conv-1/documents',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ documentId: 'doc-1' }) }),
      );
    });

    it('CP9 Remove {name} calls DELETE and removes the chip', async () => {
      const withSales = { ...entityConversation, documents: [attachedSales] };
      const fetchMock = stubApi({
        ...baseRoutes,
        'GET /api/conversations': () => json(200, { conversations: [entityConversation] }),
        'GET /api/conversations/conv-1': () => json(200, { conversation: withSales, messages: [] }),
        'DELETE /api/conversations/conv-1/documents/doc-1': () => json(200, { documents: [] }),
      });

      const user = userEvent.setup();
      renderEntityPanel();
      await user.click(await screen.findByRole('button', { name: 'Entity question' }));
      await user.click(await screen.findByRole('button', { name: 'Remove Sales.csv' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove Sales.csv' })).not.toBeInTheDocument());
      expect(screen.queryByRole('list', { name: 'Attached documents' })).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/conversations/conv-1/documents/doc-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('CP11 an attach reply that arrives after switching chats does not show on the new chat', async () => {
      const other: ConversationView = { ...entityConversation, id: 'conv-2', title: 'Other question' };
      let release: (r: Response) => void = () => {};
      stubApi({
        ...baseRoutes,
        'GET /api/conversations': () => json(200, { conversations: [entityConversation, other] }),
        'GET /api/conversations/conv-1': () => json(200, { conversation: entityConversation, messages: [] }),
        'GET /api/conversations/conv-2': () => json(200, { conversation: other, messages: [] }),
        [`GET /api/clients/${ENTITY_ID}/documents`]: () => json(200, { documents: [sales] }),
        'POST /api/conversations/conv-1/documents': () => new Promise<Response>((resolve) => { release = resolve; }),
      });

      const user = userEvent.setup();
      renderEntityPanel();
      await user.click(await screen.findByRole('button', { name: 'Entity question' }));
      await user.click(await screen.findByRole('button', { name: 'Attach document' }));
      await user.click(within(screen.getByRole('group', { name: 'Choose a document' })).getByRole('button', { name: 'Sales.csv' }));
      await user.click(screen.getByRole('button', { name: 'Other question' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Other question' })).toHaveAttribute('aria-current', 'true'));
      release(json(200, { documents: [attachedSales] }));
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByRole('list', { name: 'Attached documents' })).not.toBeInTheDocument();
    });

    it('CP12 when every document is attached the panel says so', async () => {
      const withSales = { ...entityConversation, documents: [attachedSales] };
      stubApi({
        ...baseRoutes,
        'GET /api/conversations': () => json(200, { conversations: [entityConversation] }),
        'GET /api/conversations/conv-1': () => json(200, { conversation: withSales, messages: [] }),
        [`GET /api/clients/${ENTITY_ID}/documents`]: () => json(200, { documents: [sales] }),
      });

      const user = userEvent.setup();
      renderEntityPanel();
      await user.click(await screen.findByRole('button', { name: 'Entity question' }));
      await user.click(await screen.findByRole('button', { name: 'Attach document' }));
      const group = screen.getByRole('group', { name: 'Choose a document' });
      expect(await within(group).findByText('Every document for this entity is already attached.')).toBeInTheDocument();
      expect(within(group).getByRole('link', { name: 'Upload another' })).toHaveAttribute('href', `/entities/${ENTITY_ID}/documents`);
      expect(within(group).queryByRole('button')).not.toBeInTheDocument();
    });

    it('CP10 a hub chat shows no Attach document button', async () => {
      const hubConversation: ConversationView = { ...conversation, title: 'Hub question' };
      stubApi({
        ...baseRoutes,
        'GET /api/conversations': () => json(200, { conversations: [hubConversation] }),
        'GET /api/conversations/conv-1': () => json(200, { conversation: hubConversation, messages: [] }),
      });

      const user = userEvent.setup();
      renderPanel();
      await user.click(await screen.findByRole('button', { name: 'Hub question' }));
      await screen.findByRole('button', { name: 'Send' });
      expect(screen.queryByRole('button', { name: 'Attach document' })).not.toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Attached documents' })).not.toBeInTheDocument();
    });
  });
});
