import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderAt } from './render';
import { ProgressProvider } from '../progress/ProgressContext';
import { KnowledgeLayout } from '../pages/knowledge/KnowledgeLayout';
import { Learn } from '../pages/Learn';
import { TaxCalculator } from '../components/TaxCalculator';
import { ClientRedirect, HubRedirect } from '../components/Redirects';
import { ChatPanel } from '../components/ChatPanel';
import { NOT_CONNECTED_REPLY } from '../lib/chat';
import * as session from '../lib/session';

const signedIn = {
  session: { userId: 'u1', email: 'a@firm.test', name: 'A', activeFirmId: 'org1', activeFirmName: 'Firm A', activeWorkspaceKind: 'practice' as const },
  pending: false,
};
const signedOut = { session: null, pending: false };
const acme = { workspaceId: 'org1', id: 'c1', name: 'Acme Pty Ltd', jurisdiction: 'AU' };

function renderHub(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProgressProvider>
        <Routes>
          <Route path="/knowledge" element={<KnowledgeLayout />}>
            <Route path="learn" element={<Learn />} />
          </Route>
        </Routes>
      </ProgressProvider>
    </MemoryRouter>,
  );
}

describe('Knowledge Hub', () => {
  it('shows only Australian topics for an AU entity, and Show all brings the UK back', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    localStorage.setItem('rch.entity', JSON.stringify(acme));
    const user = userEvent.setup();
    renderHub('/knowledge/learn');
    expect(screen.getByText('Showing Australia for Acme Pty Ltd.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Australia' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'United Kingdom' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show all jurisdictions' }));
    expect(await screen.findByRole('heading', { name: 'United Kingdom' })).toBeInTheDocument();
  });

  it('ignores an entity from another workspace', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedIn);
    localStorage.setItem('rch.entity', JSON.stringify({ ...acme, workspaceId: 'other' }));
    renderHub('/knowledge/learn');
    expect(screen.getByRole('heading', { name: 'United Kingdom' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Jurisdiction' })).toBeInTheDocument();
  });

  it('lets a signed-out visitor pick a jurisdiction', async () => {
    vi.mocked(session.useSessionInfo).mockReturnValue(signedOut);
    const user = userEvent.setup();
    renderHub('/knowledge/learn');
    await user.click(screen.getByRole('tab', { name: 'UK' }));
    expect(screen.queryByRole('heading', { name: 'Australia' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'United Kingdom' })).toBeInTheDocument();
    expect(localStorage.getItem('rch.hubScope')).toBe('UK');
  });
});

describe('TaxCalculator scope', () => {
  it('shows only the UK calculators for a UK scope', () => {
    renderAt('/', '/', <TaxCalculator scope="UK" />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['UK VAT return', 'UK Employer NIC', 'UK CIS']);
  });
});

describe('Redirects', () => {
  it('sends an old learning URL into the hub', async () => {
    render(
      <MemoryRouter initialEntries={['/learn/australia/bas-gst-guide?x=1']}>
        <Routes>
          <Route path="/learn/*" element={<HubRedirect />} />
          <Route path="/knowledge/learn/:section/:slug" element={<p>hub topic</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('hub topic')).toBeInTheDocument();
  });

  it('sends an old client URL to the entity dashboard', async () => {
    render(
      <MemoryRouter initialEntries={['/clients/c1']}>
        <Routes>
          <Route path="/clients/:id" element={<ClientRedirect />} />
          <Route path="/entities/:id" element={<p>entity page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('entity page')).toBeInTheDocument();
  });
});

describe('ChatPanel', () => {
  it('answers with the not-connected notice and never calls fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ChatPanel title="Ask the Knowledge Hub" placeholder="Ask" suggestions={['What is double entry?']} />);
    await user.click(screen.getByRole('button', { name: 'What is double entry?' }));
    expect(screen.getByLabelText('Your question')).toHaveValue('What is double entry?');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const log = screen.getByRole('log', { name: 'Ask the Knowledge Hub conversation' });
    expect(within(log).getByText('What is double entry?')).toBeInTheDocument();
    expect(within(log).getByText(NOT_CONNECTED_REPLY)).toBeInTheDocument();
    expect(screen.getByLabelText('Your question')).toHaveValue('');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
