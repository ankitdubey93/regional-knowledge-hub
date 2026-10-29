import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ENGAGEMENT_TEMPLATES } from '@chub/shared/data/engagementTemplates';
import { renderAt } from './render';
import { EngagementsList } from '../pages/engagements/EngagementsList';
import { EngagementDetail } from '../pages/engagements/EngagementDetail';
import { EntityEngagements } from '../pages/entity/EntityEngagements';
import { WorkspaceTemplates } from '../pages/workspace/WorkspaceTemplates';
import { WorkspaceTemplateEdit } from '../pages/workspace/WorkspaceTemplateEdit';
import type { EngagementView, TaskView } from '../lib/engagements';

const acme = {
  id: 'c1',
  name: 'Acme Pty Ltd',
  jurisdiction: 'AU',
  notes: '',
  entities: [],
  isSelf: false,
  entityType: 'company',
  taxRegistered: true,
  taxPeriod: 'quarterly',
  fyEndMonth: 6,
  timezone: null,
  registeredOn: null,
  vatStaggerMonth: null,
  mtdItsa: false,
};

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

function task(over: Partial<TaskView> = {}): TaskView {
  return {
    id: 't1',
    engagementId: 'e1',
    title: 'Reconcile bank',
    position: 0,
    assigneeId: null,
    dueOn: null,
    estimateMinutes: null,
    status: 'todo',
    doneAt: null,
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    ...over,
  };
}

const members = [
  { userId: 'u1', name: 'Ann Owner', email: 'a@x.test' },
  { userId: 'u2', name: 'Bo Member', email: 'b@x.test' },
];

const seeded = ENGAGEMENT_TEMPLATES.templates;

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

describe('Engagement pages (W1)', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('EP1 the list shows engagements', async () => {
    const fetchMock = stubApi({
      'GET /api/engagements': ok({ engagements: [eng()] }),
    });
    renderAt('/engagements', '/engagements', <EngagementsList />);
    expect(await screen.findByRole('link', { name: 'BAS Q1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Acme Pty Ltd' })).toBeInTheDocument();
    expect(screen.getByText('2 of 5 done')).toBeInTheDocument();
    const first = String(fetchMock.mock.calls[0]?.[0]);
    expect(first).toContain('status=active');
    expect(first).not.toContain('mine=');
  });

  it('EP2 the list says when nothing matches', async () => {
    stubApi({
      'GET /api/engagements': ok({ engagements: [] }),
    });
    renderAt('/engagements', '/engagements', <EngagementsList />);
    expect(await screen.findByText("No engagements match. Create one from an entity's Engagements page.")).toBeInTheDocument();
  });

  it('EP3 the status filter refetches', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/engagements': ok({ engagements: [eng()] }),
    });
    renderAt('/engagements', '/engagements', <EngagementsList />);
    await screen.findByRole('link', { name: 'BAS Q1' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Done');
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=done'))).toBe(true);
    });
    await user.click(screen.getByRole('checkbox', { name: 'Only engagements with tasks assigned to me' }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('mine=1'))).toBe(true);
    });
  });

  it("EP4 a task's status is saved", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/engagements/e1': ok({ engagement: eng(), tasks: [task(), task({ id: 't2', title: 'Lodge', position: 1 })] }),
      'GET /api/engagements/members': ok({ members }),
      'PATCH /api/engagements/e1/tasks/t1': ok({ task: task({ status: 'done', doneAt: '2026-10-28T01:00:00.000Z' }) }),
    });
    renderAt('/engagements/e1', '/engagements/:id', <EngagementDetail />);
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Status of Reconcile bank' }), 'Done');
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ status: 'done' });
  });

  it('EP5 assigning a member', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/engagements/e1': ok({ engagement: eng(), tasks: [task(), task({ id: 't2', title: 'Lodge', position: 1 })] }),
      'GET /api/engagements/members': ok({ members }),
      'PATCH /api/engagements/e1/tasks/t1': ok({ task: task({ assigneeId: 'u2' }) }),
    });
    renderAt('/engagements/e1', '/engagements/:id', <EngagementDetail />);
    const select = await screen.findByRole('combobox', { name: 'Assignee for Reconcile bank' });
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Unassigned', 'Ann Owner', 'Bo Member']);
    await user.selectOptions(select, 'Bo Member');
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ assigneeId: 'u2' });
  });

  it('EP6 moving a task', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/engagements/e1': ok({ engagement: eng(), tasks: [task(), task({ id: 't2', title: 'Lodge', position: 1 })] }),
      'GET /api/engagements/members': ok({ members }),
      'POST /api/engagements/e1/tasks/t1/move': ok({
        tasks: [task({ id: 't2', title: 'Lodge', position: 0 }), task({ position: 1 })],
      }),
    });
    renderAt('/engagements/e1', '/engagements/:id', <EngagementDetail />);
    await screen.findByRole('combobox', { name: 'Assignee for Reconcile bank' });
    expect(screen.getByRole('button', { name: 'Move Reconcile bank up' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move Reconcile bank down' }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/engagements/e1/tasks/t1/move')).toBe(true);
    });
    const move = fetchMock.mock.calls.find(([url]) => String(url) === '/api/engagements/e1/tasks/t1/move');
    expect(JSON.parse(String(move?.[1]?.body))).toEqual({ direction: 'down' });
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByText('Lodge')).toBeInTheDocument();
  });

  it('EP7 adding a task', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/engagements/e1': ok({ engagement: eng(), tasks: [task()] }),
      'GET /api/engagements/members': ok({ members }),
      'POST /api/engagements/e1/tasks': {
        status: 201,
        body: { task: task({ id: 't3', title: 'Send pack', position: 2 }) },
      },
    });
    renderAt('/engagements/e1', '/engagements/:id', <EngagementDetail />);
    const form = await screen.findByRole('form', { name: 'Add a task' });
    await user.type(within(form).getByRole('textbox', { name: 'Task' }), 'Send pack');
    await user.click(within(form).getByRole('button', { name: 'Add task' }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ title: 'Send pack' });
    expect(await screen.findByText('Added.')).toBeInTheDocument();
  });

  it('EP8 creating an engagement for an entity', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/engagements': ok({ engagements: [], autoEngagements: false }),
      'GET /api/engagement-templates': ok({ seeded, templates: [] }),
      'POST /api/clients/c1/engagements': { status: 201, body: { engagement: eng({ title: 'BAS' }) } },
    });
    renderAt('/entities/c1/engagements', '/entities/:id/engagements', <EntityEngagements />);
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Template' }), 'BAS (suggested)');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('BAS');
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-11-28' } });
    await user.click(screen.getByRole('button', { name: 'Create engagement' }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/clients/c1/engagements');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      templateId: 'seed:bas',
      title: 'BAS',
      dueOn: '2026-11-28',
      periodEnd: null,
    });
  });

  it('EP9 the due-date switch', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/engagements': ok({ engagements: [], autoEngagements: false }),
      'GET /api/engagement-templates': ok({ seeded, templates: [] }),
      'PATCH /api/clients/c1/engagements/auto': ok({ autoEngagements: true }),
    });
    renderAt('/entities/c1/engagements', '/entities/:id/engagements', <EntityEngagements />);
    const open = await screen.findByRole('button', { name: 'Open engagements for the next 90 days' });
    expect(open).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: "Open engagements from this entity's due dates" }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ enabled: true });
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open engagements for the next 90 days' })).toBeEnabled();
    });
  });

  it('EP10 opening from due dates', async () => {
    const user = userEvent.setup();
    stubApi({
      'GET /api/clients/c1': ok({ client: acme }),
      'GET /api/clients/c1/engagements': ok({ engagements: [], autoEngagements: true }),
      'GET /api/engagement-templates': ok({ seeded, templates: [] }),
      'POST /api/clients/c1/engagements/open': ok({
        created: 2,
        engagements: [eng(), eng({ id: 'e2', title: 'Year end' })],
      }),
    });
    renderAt('/entities/c1/engagements', '/entities/:id/engagements', <EntityEngagements />);
    const open = await screen.findByRole('button', { name: 'Open engagements for the next 90 days' });
    await vi.waitFor(() => {
      expect(open).toBeEnabled();
    });
    await user.click(open);
    expect(await screen.findByText('Opened 2 engagements.')).toBeInTheDocument();
  });

  it('EP11 copying a suggested template', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/engagement-templates': ok({ seeded, templates: [] }),
      'POST /api/engagement-templates': {
        status: 201,
        body: {
          template: {
            id: 'tp1',
            name: 'BAS',
            kind: 'bas',
            seedId: 'bas',
            steps: seeded[1]!.steps,
            createdBy: 'u1',
            createdAt: '2026-10-28T00:00:00.000Z',
            updatedAt: '2026-10-28T00:00:00.000Z',
          },
        },
      },
    });
    renderAt('/workspace/templates', '/workspace/templates', <WorkspaceTemplates />);
    await user.click(await screen.findByRole('button', { name: 'Copy BAS' }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ seedId: 'bas' });
  });

  it('EP12 editing a template', async () => {
    const user = userEvent.setup();
    const template = {
      id: 'tp1',
      name: 'BAS',
      kind: 'bas',
      seedId: 'bas',
      steps: [{ title: 'Check', estimateMinutes: null }],
      createdBy: 'u1',
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    };
    const fetchMock = stubApi({
      'GET /api/engagement-templates/tp1': ok({ template }),
      'PATCH /api/engagement-templates/tp1': ok({ template }),
    });
    renderAt('/workspace/templates/tp1', '/workspace/templates/:id', <WorkspaceTemplateEdit />);
    expect(await screen.findByRole('button', { name: 'Remove step 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Add step' }));
    await user.type(screen.getByRole('textbox', { name: 'Step 2' }), 'Lodge');
    await user.type(screen.getByRole('spinbutton', { name: 'Estimate in minutes for step 2' }), '30');
    await user.click(screen.getByRole('button', { name: 'Save template' }));
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
      name: 'BAS',
      steps: [
        { title: 'Check', estimateMinutes: null },
        { title: 'Lodge', estimateMinutes: 30 },
      ],
    });
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });
});
