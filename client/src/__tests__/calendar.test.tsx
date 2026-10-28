import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderAt } from './render';
import { EntityCalendar } from '../pages/entity/EntityCalendar';
import { DueSoon } from '../components/DueSoon';
import type { ClientRecord } from '../lib/entity';

const birch: ClientRecord = {
  id: 'c1',
  name: 'Birch Ltd',
  notes: '',
  entities: [],
  isSelf: false,
  jurisdiction: 'UK',
  entityType: 'company',
  taxRegistered: true,
  taxPeriod: 'quarterly',
  fyEndMonth: 3,
  timezone: 'Europe/London',
  registeredOn: '2025-05-14',
  vatStaggerMonth: 3,
  mtdItsa: false,
};

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

function renderPage() {
  renderAt('/entities/c1/calendar', '/entities/:id/calendar', <EntityCalendar />);
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('Entity calendar (C1)', () => {
  beforeEach(() => {
    // Call history only: the mocked implementations from setup.ts stay in place.
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows due dates with their rule status', async () => {
    stubApi({ 'GET /api/clients/c1': ok({ client: birch }) });
    renderPage();
    expect(await screen.findByText('7 November 2026')).toBeInTheDocument();
    expect(screen.getByText('VAT return for the period ending 30 September 2026')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Checked' }).length).toBeGreaterThan(0);
  });

  it('says what it does not show', async () => {
    stubApi({ 'GET /api/clients/c1': ok({ client: birch }) });
    renderPage();
    expect(await screen.findByText('Due dates are not moved for weekends or public holidays.')).toBeInTheDocument();
  });

  it('asks for the stagger month when missing', async () => {
    stubApi({ 'GET /api/clients/c1': ok({ client: { ...birch, vatStaggerMonth: null } }) });
    renderPage();
    expect(await screen.findByText('Set the month a VAT quarter ends to see VAT returns.')).toBeInTheDocument();
    expect(screen.queryByText(/^VAT return for the period ending/)).not.toBeInTheDocument();
  });

  it('saves calendar details', async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi({
      'GET /api/clients/c1': ok({ client: birch }),
      'PATCH /api/clients/c1': ok({ client: { ...birch, timezone: 'Australia/Sydney' } }),
    });
    renderPage();
    await user.selectOptions(await screen.findByLabelText('Timezone'), 'Australia/Sydney');
    await user.click(screen.getByRole('button', { name: 'Save calendar details' }));
    const saved = await screen.findByText('Saved.');
    expect(saved).toHaveAttribute('role', 'status');
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toBe('/api/clients/c1');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual(expect.objectContaining({ timezone: 'Australia/Sydney' }));
  });

  it('downloads an ics file', async () => {
    const user = userEvent.setup();
    stubApi({ 'GET /api/clients/c1': ok({ client: birch }) });
    const originalCreateObjectURL = URL.createObjectURL;
    const createObjectURL = vi.fn((_blob: Blob | MediaSource) => 'blob:calendar');
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const revokeObjectURL = vi.fn((_url: string) => undefined);
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    try {
      renderPage();
      await user.click(await screen.findByRole('button', { name: 'Download calendar (.ics)' }));
      const blob = createObjectURL.mock.calls[0]?.[0];
      if (!(blob instanceof Blob)) throw new Error('expected a Blob');
      expect(blob.type).toBe('text/calendar');
      const text = await readBlob(blob);
      expect(text).toContain('BEGIN:VCALENDAR');
      expect(text).toContain('DTSTART;VALUE=DATE:20261107');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:calendar');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('due soon lists the next 30 days', () => {
    render(
      <MemoryRouter>
        <DueSoon clients={[birch]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Due in the next 30 days' })).toBeInTheDocument();
  });
});
