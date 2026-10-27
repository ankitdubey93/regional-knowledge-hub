import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderAt } from './render';
import { Laws } from '../pages/knowledge/Laws';
import { LawDetailPage } from '../pages/knowledge/LawDetail';
import { HubRedirect } from '../components/Redirects';
import type { LawDetail, LawListItem } from '../lib/laws';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const BILL_ID = '9d1f2c3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';

const bill: LawListItem = {
  id: BILL_ID,
  title: 'Tax Bill 2026',
  citation: 'Tax Bill 2026 (UK)',
  jurisdiction: 'UK',
  kind: 'bill',
  publisher: 'UK Parliament',
  officialUrl: 'https://bills.parliament.uk/bills/1234',
  billStatus: 'introduced',
  enactedAs: null,
  versionLabel: 'Introduced 2026-10-26',
  effectiveFrom: null,
  retrievedOn: '2026-10-26',
  publishedAt: '2026-10-26T00:00:00.000Z',
};

describe('Laws', () => {
  it('L1 shows the empty state when nothing is published', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { laws: [] })));
    renderAt('/knowledge/laws', '/knowledge/laws', <Laws />);
    expect(await screen.findByText('No laws published yet.')).toBeInTheDocument();
  });

  it('L2 a bill shows Bill: not law and its official link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { laws: [bill] })));
    renderAt('/knowledge/laws', '/knowledge/laws', <Laws />);
    expect(await screen.findByText('Bill: not law')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Official source' })).toHaveAttribute('href', 'https://bills.parliament.uk/bills/1234');
  });

  it('L3 detail renders the body and version', async () => {
    const law: LawDetail = { ...bill, bodyMd: '## Section 1 Short title\n\nThis Bill may be cited as the Tax Bill 2026.' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { law })));
    renderAt(`/knowledge/laws/${BILL_ID}`, '/knowledge/laws/:id', <LawDetailPage />);
    expect(await screen.findByRole('heading', { name: 'Section 1 Short title' })).toBeInTheDocument();
    expect(screen.getByText('Introduced 2026-10-26')).toBeInTheDocument();
  });

  it('L4 /laws redirects to /knowledge/laws', async () => {
    render(
      <MemoryRouter initialEntries={['/laws']}>
        <Routes>
          <Route path="/laws/*" element={<HubRedirect />} />
          <Route path="/knowledge/laws" element={<p>laws page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('laws page')).toBeInTheDocument();
  });
});
