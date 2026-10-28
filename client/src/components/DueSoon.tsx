import { calendarProfile, calendarRules, entityToday } from '../lib/calendar';
import type { ClientRecord } from '../lib/entity';
import { addDays, formatDay, obligationsFor, type Obligation } from '@chub/shared/utils/deadlines';
import { Card, TextLink } from './ui';

interface DueItem {
  client: ClientRecord;
  obligation: Obligation;
}

/** The next 30 days of due dates across every client, soonest first, at most 8. Renders nothing when there are none. */
export function DueSoon({ clients }: { clients: ClientRecord[] }) {
  const now = new Date();
  const items: DueItem[] = clients.flatMap((c) => {
    const today = entityToday(c, now);
    return obligationsFor(calendarProfile(c), calendarRules(), today, addDays(today, 30)).map((obligation) => ({ client: c, obligation }));
  });
  items.sort((a, b) => a.obligation.dueDate.localeCompare(b.obligation.dueDate) || a.client.name.localeCompare(b.client.name));
  const shown = items.slice(0, 8);
  if (shown.length === 0) return null;
  return (
    <Card className="mb-6">
      <h2 className="font-semibold">Due in the next 30 days</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {shown.map(({ client, obligation }) => (
          <li key={`${client.id}:${obligation.id}`}>
            <TextLink to={`/entities/${client.id}/calendar`}>{client.name}</TextLink>: {obligation.label}, due {formatDay(obligation.dueDate)}
          </li>
        ))}
      </ul>
    </Card>
  );
}
