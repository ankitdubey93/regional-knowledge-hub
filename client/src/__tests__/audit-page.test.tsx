import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderAt } from './render';
import { AuditLog } from '../pages/workspace/AuditLog';
import type { AuditEvent } from '../lib/audit';

function ev(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 1,
    action: 'sign_in',
    actorId: 'u1',
    actorName: 'Ann',
    targetType: 'user',
    targetId: 'u1abcdefgh',
    detail: {},
    createdAt: '2026-10-30T01:00:00.000Z',
    ...overrides,
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

describe('Audit log (P5c)', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
  });

  it('AP1 an owner sees an empty retention form and no activity', async () => {
    stubApi({
      'GET /api/workspace/retention': ok({ retention: { documentsDays: null, conversationsDays: null }, canEdit: true }),
      'GET /api/audit': ok({ events: [], nextBefore: null }),
    });
    renderAt('/workspace/audit', '/workspace/audit', <AuditLog />);
    expect(await screen.findByText('No activity yet.')).toBeInTheDocument();
    expect(screen.getByLabelText('Keep documents for (days)')).toHaveValue(null);
  });

  it('AP2 the owner saves retention', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/workspace/retention': ok({ retention: { documentsDays: null, conversationsDays: null }, canEdit: true }),
      'GET /api/audit': ok({ events: [], nextBefore: null }),
      'PATCH /api/workspace/retention': ok({ retention: { documentsDays: 365, conversationsDays: null } }),
    });
    renderAt('/workspace/audit', '/workspace/audit', <AuditLog />);
    await screen.findByText('No activity yet.');
    await user.type(screen.getByLabelText('Keep documents for (days)'), '365');
    await user.click(screen.getByRole('button', { name: 'Save retention' }));
    expect(await screen.findByText('Retention saved.')).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH');
    expect(JSON.parse(String((patch?.[1] as RequestInit | undefined)?.body))).toEqual({ documentsDays: 365, conversationsDays: null });
  });

  it('AP3 a non-owner sees the settings but no form', async () => {
    stubApi({
      'GET /api/workspace/retention': ok({ retention: { documentsDays: 30, conversationsDays: null }, canEdit: false }),
      'GET /api/audit': ok({ events: [], nextBefore: null }),
    });
    renderAt('/workspace/audit', '/workspace/audit', <AuditLog />);
    expect(await screen.findByText('30 days')).toBeInTheDocument();
    expect(screen.getByText('Kept forever')).toBeInTheDocument();
    expect(screen.getByText('Only the workspace owner can change retention.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save retention' })).toBeNull();
  });

  it('AP4 events show who did what', async () => {
    stubApi({
      'GET /api/workspace/retention': ok({ retention: { documentsDays: null, conversationsDays: null }, canEdit: true }),
      'GET /api/audit': ok({
        events: [
          ev(),
          ev({ id: 2, action: 'retention.purge', actorId: null, actorName: null, targetType: 'organization', detail: { documents: 3, conversations: 1 } }),
        ],
        nextBefore: null,
      }),
    });
    renderAt('/workspace/audit', '/workspace/audit', <AuditLog />);
    expect(await screen.findByText('Signed in')).toBeInTheDocument();
    expect(screen.getByText('Ann')).toBeInTheDocument();
    expect(screen.getByText('User u1abcdef')).toBeInTheDocument();
    expect(screen.getByText('Purged old records')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Documents: 3, conversations: 1')).toBeInTheDocument();
  });

  it('AP5 a member sees the server\'s refusal', async () => {
    stubApi({
      'GET /api/workspace/retention': ok({ retention: { documentsDays: null, conversationsDays: null }, canEdit: false }),
      'GET /api/audit': { status: 403, body: { error: 'Only firm owners and admins can see the audit log' } },
    });
    renderAt('/workspace/audit', '/workspace/audit', <AuditLog />);
    expect(await screen.findByText('Only firm owners and admins can see the audit log')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('AP6 Load older appends the next page', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/workspace/retention')) {
          return jsonResponse(200, { retention: { documentsDays: null, conversationsDays: null }, canEdit: true });
        }
        if (url.includes('before=5')) {
          return jsonResponse(200, {
            events: [ev({ id: 4, action: 'document.upload', targetType: 'document', targetId: 'doc4abcdef' })],
            nextBefore: null,
          });
        }
        if (url.startsWith('/api/audit')) {
          return jsonResponse(200, { events: [ev({ id: 5 })], nextBefore: 5 });
        }
        return jsonResponse(404, { error: 'No stub' });
      }),
    );
    renderAt('/workspace/audit', '/workspace/audit', <AuditLog />);
    expect(await screen.findByText('Signed in')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load older' }));
    expect(await screen.findByText('Uploaded a document')).toBeInTheDocument();
    expect(screen.getByText('Signed in')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull();
  });
});
