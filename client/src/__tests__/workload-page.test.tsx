import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { WorkloadPage } from '../pages/engagements/WorkloadPage';
import type { WorkloadView } from '../lib/workload';

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

const ann = {
  userId: 'u1',
  name: 'Ann Owner',
  email: 'a@x.test',
  capacityMinutes: 1800,
  capacityIsDefault: false,
  overdueMinutes: 120,
  thisWeek: { openMinutes: 2130, loadBp: 12500 },
  nextWeek: { openMinutes: 600, loadBp: 3333 },
  unestimatedCount: 1,
};
const bo = {
  userId: 'u2',
  name: 'Bo Member',
  email: 'b@x.test',
  capacityMinutes: 2250,
  capacityIsDefault: true,
  overdueMinutes: 0,
  thisWeek: { openMinutes: 0, loadBp: 0 },
  nextWeek: { openMinutes: 240, loadBp: 1067 },
  unestimatedCount: 0,
};

function view(over: Partial<WorkloadView> = {}): WorkloadView {
  return {
    timezone: 'Australia/Sydney',
    canEdit: true,
    weekStart: '2026-11-02',
    nextWeekStart: '2026-11-09',
    rows: [ann, bo],
    ...over,
  };
}

describe('Workload page (W2)', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('WP1 an owner sets the firm timezone first', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/workload': ok(view({ timezone: null, weekStart: null, nextWeekStart: null, rows: [] })),
      'PATCH /api/workload/timezone': ok({ timezone: 'Europe/London' }),
    });
    renderAt('/workload', '/workload', <WorkloadPage />);
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Firm timezone' }), 'Europe/London');
    await user.click(screen.getByRole('button', { name: 'Save firm timezone' }));
    expect(await screen.findByText('Firm timezone saved.')).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ timezone: 'Europe/London' });
  });

  it('WP2 a member is asked to wait', async () => {
    stubApi({
      'GET /api/workload': ok(view({ timezone: null, canEdit: false, weekStart: null, nextWeekStart: null, rows: [] })),
    });
    renderAt('/workload', '/workload', <WorkloadPage />);
    expect(await screen.findByText("Ask an owner or admin to set the firm's timezone.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save firm timezone' })).toBeNull();
  });

  it('WP3 the table shows load against capacity', async () => {
    stubApi({ 'GET /api/workload': ok(view()) });
    renderAt('/workload', '/workload', <WorkloadPage />);
    const annRow = within(await screen.findByRole('row', { name: /Ann Owner/ }));
    for (const text of ['30 h', '2 h', '35 h 30 min', '125%', 'Over capacity', '10 h', '33%', '1']) {
      expect(annRow.getByText(text)).toBeInTheDocument();
    }
    const boRow = within(screen.getByRole('row', { name: /Bo Member/ }));
    expect(boRow.getByText('37 h 30 min (default)')).toBeInTheDocument();
    // Overdue and this week are both 0 min for Bo, so the text appears twice in the row.
    expect(boRow.getAllByText('0 min')).toHaveLength(2);
    expect(boRow.getByText('0%')).toBeInTheDocument();
    expect(boRow.getByText('4 h')).toBeInTheDocument();
    expect(boRow.getByText('11%')).toBeInTheDocument();
    expect(screen.getAllByText('Over capacity')).toHaveLength(1);
    expect(
      screen.getByText(
        'Weeks run Monday to Sunday in Australia/Sydney. This week starts 2 November 2026; next week starts 9 November 2026.',
      ),
    ).toBeInTheDocument();
  });

  it('WP4 saving a member capacity', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/workload': ok(view()),
      'PATCH /api/workload/capacity/u2': ok({ userId: 'u2', weeklyMinutes: 1500 }),
    });
    renderAt('/workload', '/workload', <WorkloadPage />);
    const input = await screen.findByRole('spinbutton', { name: 'Weekly capacity in minutes for Bo Member' });
    await user.clear(input);
    await user.type(input, '1500');
    await user.click(screen.getByRole('button', { name: 'Save capacity for Bo Member' }));
    expect(await screen.findByText('Capacity saved for Bo Member.')).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ weeklyMinutes: 1500 });
    const gets = fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === 'GET');
    expect(gets.length).toBeGreaterThanOrEqual(2);
  });

  it('WP5 a member cannot edit', async () => {
    stubApi({ 'GET /api/workload': ok(view({ canEdit: false })) });
    renderAt('/workload', '/workload', <WorkloadPage />);
    await screen.findByRole('row', { name: /Ann Owner/ });
    expect(screen.queryByRole('button', { name: 'Save capacity for Ann Owner' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save firm timezone' })).toBeNull();
  });

  it('WP6 a bad capacity sends nothing', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({ 'GET /api/workload': ok(view()) });
    renderAt('/workload', '/workload', <WorkloadPage />);
    const input = await screen.findByRole('spinbutton', { name: 'Weekly capacity in minutes for Ann Owner' });
    await user.clear(input);
    await user.type(input, '7000');
    await user.click(screen.getByRole('button', { name: 'Save capacity for Ann Owner' }));
    expect(await screen.findByText('Enter whole minutes from 0 to 6000.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0);
  });
});
