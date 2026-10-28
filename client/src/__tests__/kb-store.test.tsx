import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { allFacts, rateBp, setFacts } from '../data/facts';
import { setDocs } from '../content/docs';
import { loadKb } from '../lib/kbStore';
import { seedFacts, seedSiteDocs } from './seedData';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Every test puts the seeded registries back, so no test leaks into the next.
afterEach(() => {
  setFacts(seedFacts);
  setDocs(seedSiteDocs);
});

describe('knowledge base store', () => {
  it('K1 loadKb fills the registries', async () => {
    setFacts({});
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { facts: seedFacts, docs: seedSiteDocs })));
    await loadKb();
    expect(rateBp('au.gst.rate')).toBe(seedFacts['au.gst.rate']!.value);
  });

  it('K2 fact() before load throws FactsNotLoadedError', async () => {
    vi.resetModules();
    const fresh = await import('../data/facts');
    expect(() => fresh.fact('au.gst.rate')).toThrow(fresh.FactsNotLoadedError);
  });

  it('K3 KbGate shows the error and Try again on a failed load', async () => {
    vi.resetModules();
    const { KbGate: FreshKbGate } = await import('../components/KbGate');
    const fetchMock = vi.fn(async () => jsonResponse(500, { error: 'Server error' }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <FreshKbGate>
        <p>ok</p>
      </FreshKbGate>,
    );
    expect(
      await screen.findByText(
        "Couldn't load the knowledge base. Rates and guides come from it, so nothing is shown until it loads.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('ok')).not.toBeInTheDocument();

    fetchMock.mockImplementation(async () => jsonResponse(200, { facts: seedFacts, docs: seedSiteDocs }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('ok')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('K4 a malformed payload is an error, not a partial load', async () => {
    setFacts({});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { facts: { 'au.gst.rate': { value: 'x' } }, docs: [] })),
    );
    await expect(loadKb()).rejects.toThrow();
    expect(allFacts()).toEqual({});
  });
});
