import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { TimePage } from '../pages/time/TimePage';
import { TimerChip } from '../components/TimerChip';
import { EngagementTime } from '../components/EngagementTime';
import type { TimeEntryView } from '../lib/time';
import type { EngagementView } from '../lib/engagements';

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

const entry = (over: Partial<TimeEntryView>): TimeEntryView => ({
  id: 'e1',
  userId: 'u1',
  userName: 'Ann Owner',
  clientId: 'c1',
  clientName: 'Harbour Co',
  engagementId: null,
  engagementTitle: null,
  taskId: null,
  taskTitle: null,
  workDate: '2026-11-02',
  startedAt: null,
  minutes: 90,
  billable: true,
  note: 'Bank rec',
  invoiceId: null,
  canEdit: true,
  createdAt: '2026-11-02T01:00:00.000Z',
  updatedAt: '2026-11-02T01:00:00.000Z',
  ...over,
});

/** The default stubs for the /time page. */
function defaultRoutes(over: Record<string, Stub> = {}): Record<string, Stub> {
  return {
    'GET /api/clients': ok({ clients: [{ id: 'c1', name: 'Harbour Co' }] }),
    'GET /api/clients/c1/engagements': ok({ engagements: [], autoEngagements: false }),
    'GET /api/time/timer': ok({ timer: null }),
    'GET /api/time': ok({ entries: [entry({}), entry({ id: 'e2', minutes: 30, billable: false, note: '' })] }),
    ...over,
  };
}

const engagement: EngagementView = {
  id: 'g1',
  clientId: 'c1',
  clientName: 'Harbour Co',
  templateId: 'seed:bas',
  title: 'BAS Q1',
  kind: 'bas',
  periodEnd: '2026-09-30',
  dueOn: '2026-11-28',
  status: 'planned',
  obligationId: null,
  taskCount: 0,
  doneCount: 0,
  createdBy: 'u1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('time', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('TP1 the week by day', async () => {
    stubApi(defaultRoutes());
    renderAt('/time?week=2026-11-02', '/time', <TimePage />);
    expect(await screen.findByText('Week of 2 November 2026')).toBeInTheDocument();
    const monday = within(await screen.findByRole('row', { name: /Monday 2 November 2026/ }));
    expect(monday.getByText('2 h')).toBeInTheDocument();
    expect(monday.getByText('1 h 30 min')).toBeInTheDocument();
    const total = within(screen.getByRole('row', { name: /Total/ }));
    expect(total.getByText('2 h')).toBeInTheDocument();
  });

  it('TP2 starting a timer', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(
      defaultRoutes({
        'POST /api/time/timer': { status: 201, body: { timer: entry({ id: 't1', minutes: null, startedAt: '2026-11-02T00:00:00.000Z' }) } },
      }),
    );
    renderAt('/time?week=2026-11-02', '/time', <TimePage />);
    await user.click(await screen.findByRole('button', { name: 'Start timer' }));
    expect(await screen.findByRole('button', { name: 'Stop timer' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Timer started.');
    const post = fetchMock.mock.calls.find(([url, init]) => url === '/api/time/timer' && init?.method === 'POST');
    const body = JSON.parse(String(post?.[1]?.body));
    expect(body).toMatchObject({ clientId: 'c1', engagementId: null, taskId: null, billable: true, note: '' });
    expect(body.workDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('TP3 minutes are checked before sending', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(defaultRoutes());
    renderAt('/time?week=2026-11-02', '/time', <TimePage />);
    const form = within(await screen.findByRole('form', { name: 'Add time' }));
    await user.type(form.getByRole('spinbutton', { name: 'Minutes' }), '0');
    await user.click(form.getByRole('button', { name: 'Add entry' }));
    expect(await screen.findByText('Enter whole minutes from 1 to 1440.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('TP4 locked and read-only rows', async () => {
    stubApi(
      defaultRoutes({
        'GET /api/time': ok({ entries: [entry({ invoiceId: 'inv1', canEdit: false }), entry({ id: 'e2', canEdit: false })] }),
      }),
    );
    renderAt('/time?week=2026-11-02', '/time', <TimePage />);
    expect(await screen.findAllByText('Invoiced')).toHaveLength(1);
    expect(screen.queryAllByRole('button', { name: /^Edit time on/ })).toHaveLength(0);
  });

  it('TP5 editing an entry', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(defaultRoutes({ 'PATCH /api/time/e1': ok({ entry: entry({ minutes: 45 }) }) }));
    renderAt('/time?week=2026-11-02', '/time', <TimePage />);
    const edits = await screen.findAllByRole('button', { name: 'Edit time on 2 November 2026 for Harbour Co' });
    const firstEdit = edits[0];
    if (!firstEdit) throw new Error('no edit button rendered');
    await user.click(firstEdit);
    const form = within(screen.getByRole('form', { name: 'Edit time entry' }));
    const minutesInput = form.getByRole('spinbutton', { name: 'Minutes' });
    await user.clear(minutesInput);
    await user.type(minutesInput, '45');
    await user.click(form.getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toBe('/api/time/e1');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ workDate: '2026-11-02', minutes: 45, billable: true, note: 'Bank rec' });
  });

  it('TP6 the timer chip', async () => {
    const user = userEvent.setup();
    // Not running: the chip renders nothing.
    const idle = stubApi({ 'GET /api/time/timer': ok({ timer: null }) });
    const first = renderAt('/', '/', <TimerChip />);
    await waitFor(() => expect(idle).toHaveBeenCalled());
    expect(screen.queryByRole('group', { name: 'Running timer' })).toBeNull();
    first.unmount();

    // Running: the server clears the timer on DELETE, so the fake is stateful like the server.
    let running = true;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url.split('?')[0] ?? url}`;
      if (key === 'GET /api/time/timer') {
        return jsonResponse(200, { timer: running ? entry({ minutes: null, startedAt: '2026-11-02T00:00:00.000Z' }) : null });
      }
      if (key === 'DELETE /api/time/timer') {
        running = false;
        return jsonResponse(200, { entry: entry({}), capped: false });
      }
      return jsonResponse(404, { error: `No stub for ${key}` });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/', '/', <TimerChip />);
    expect(await screen.findByRole('group', { name: 'Running timer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop the running timer' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Running timer' })).toBeNull());
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/time/timer' && init?.method === 'DELETE')).toBe(true);
  });

  it('TP7 the engagement time card', async () => {
    const idle = stubApi(defaultRoutes());
    const first = renderAt('/e', '/e', <EngagementTime engagement={engagement} tasks={[]} />);
    expect(await screen.findByText('Logged: 2 h (1 h 30 min billable)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start timer on this engagement' })).toBeInTheDocument();
    expect(idle).toHaveBeenCalled();
    first.unmount();

    // With a timer already running, the card says so and the start button is disabled.
    stubApi(
      defaultRoutes({
        'GET /api/time/timer': ok({ timer: entry({ minutes: null, startedAt: '2026-11-02T00:00:00.000Z' }) }),
      }),
    );
    renderAt('/e', '/e', <EngagementTime engagement={engagement} tasks={[]} />);
    expect(await screen.findByText('A timer is already running.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start timer on this engagement' })).toBeDisabled();
  });
});
