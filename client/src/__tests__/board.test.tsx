import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { BoardPage } from '../pages/engagements/BoardPage';
import type { EngagementView } from '../lib/engagements';

function eng(over: Partial<EngagementView> = {}): EngagementView {
  return {
    id: 'e1',
    clientId: 'c1',
    clientName: 'Acme Pty Ltd',
    templateId: 'seed:bas',
    title: 'BAS Q1',
    kind: 'bas',
    periodEnd: '2026-09-30',
    dueOn: '2026-10-28',
    status: 'planned',
    obligationId: null,
    taskCount: 5,
    doneCount: 2,
    createdBy: 'u1',
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    ...over,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Stub {
  status: number;
  body: unknown;
}
const ok = (body: unknown): Stub => ({ status: 200, body });

/** Routes fetch by "METHOD /path" (query string ignored). Unknown routes answer 404, so nothing reaches the network. */
function stubApi(routes: Record<string, Stub>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url.split('?')[0] ?? url}`;
    const stub = routes[key];
    if (!stub) return jsonResponse(404, { error: `No stub for ${key}` });
    return jsonResponse(stub.status, stub.body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Board (W2)', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('BD1 columns show active engagements by status', async () => {
    const fetchMock = stubApi({
      'GET /api/engagements': ok({
        engagements: [
          eng(),
          eng({ id: 'e2', title: 'VAT Q3', status: 'in_progress' }),
          eng({ id: 'e3', title: 'Year end 2026', status: 'review' }),
        ],
      }),
    });
    renderAt('/board', '/board', <BoardPage />);
    expect(within(await screen.findByRole('region', { name: 'Planned' })).getByRole('link', { name: 'BAS Q1' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'In progress' })).getByRole('link', { name: 'VAT Q3' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Review' })).getByRole('link', { name: 'Year end 2026' })).toBeInTheDocument();
    const first = String(fetchMock.mock.calls[0]?.[0]);
    expect(first).toContain('status=active');
  });

  it('BD2 Move right saves and moves the card', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/engagements': ok({ engagements: [eng()] }),
      'PATCH /api/engagements/e1': ok({ engagement: eng({ status: 'in_progress' }) }),
    });
    renderAt('/board', '/board', <BoardPage />);
    await user.click(await screen.findByRole('button', { name: 'Move BAS Q1 right' }));
    expect(within(await screen.findByRole('region', { name: 'In progress' })).getByRole('link', { name: 'BAS Q1' })).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ status: 'in_progress' });
    expect(screen.getByRole('combobox', { name: 'Status of BAS Q1' })).toHaveFocus();
    expect(await screen.findByText('BAS Q1 moved to In progress.')).toBeInTheDocument();
  });

  it('BD3 Move left is disabled in Planned', async () => {
    stubApi({
      'GET /api/engagements': ok({
        engagements: [eng(), eng({ id: 'e2', title: 'VAT Q3', status: 'in_progress' })],
      }),
    });
    renderAt('/board', '/board', <BoardPage />);
    expect(await screen.findByRole('button', { name: 'Move BAS Q1 left' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move VAT Q3 left' })).toBeEnabled();
  });

  it('BD4 choosing Done removes the card', async () => {
    const user = userEvent.setup();
    stubApi({
      'GET /api/engagements': ok({ engagements: [eng()] }),
      'PATCH /api/engagements/e1': ok({ engagement: eng({ status: 'done' }) }),
    });
    renderAt('/board', '/board', <BoardPage />);
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status of BAS Q1' }), 'Done');
    await vi.waitFor(() => {
      expect(screen.queryByRole('link', { name: 'BAS Q1' })).toBeNull();
    });
    expect(await screen.findByText('BAS Q1 moved to Done.')).toBeInTheDocument();
  });

  it('BD5 a failed move keeps the card', async () => {
    const user = userEvent.setup();
    stubApi({
      'GET /api/engagements': ok({ engagements: [eng()] }),
      'PATCH /api/engagements/e1': { status: 404, body: { error: 'Engagement not found' } },
    });
    renderAt('/board', '/board', <BoardPage />);
    await user.click(await screen.findByRole('button', { name: 'Move BAS Q1 right' }));
    expect(await screen.findByText('Engagement not found')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Planned' })).getByRole('link', { name: 'BAS Q1' })).toBeInTheDocument();
  });

  it('BD6 empty columns say so', async () => {
    stubApi({
      'GET /api/engagements': ok({ engagements: [] }),
    });
    renderAt('/board', '/board', <BoardPage />);
    expect((await screen.findAllByText('No engagements.')).length).toBe(3);
  });
});
