import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { dueWithin } from '../lib/calendar';
import type { ClientRecord } from '../lib/entity';
import { daysBetween } from '@chub/shared/utils/deadlines';
import { Card, JurisdictionBadge, cx } from './ui';

/** Due dates this close are highlighted. */
const SOON_DAYS = 7;

const monthShort = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  month: 'short',
});

function dateParts(iso: string): { day: number; month: string } {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return { day: d, month: monthShort.format(new Date(Date.UTC(y, m - 1, d))) };
}

function inDays(n: number): string {
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${n} days`;
}

function Countdown({ days, className }: { days: number; className?: string }) {
  return (
    <span
      className={cx(
        'whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        days <= SOON_DAYS ? 'bg-warn-soft text-warn' : 'bg-panel-2 text-muted',
        className,
      )}
    >
      {inDays(days)}
    </span>
  );
}

/** The next 30 days of due dates across every client, soonest first, at most 8. Renders nothing when there are none. */
export function DueSoon({ clients }: { clients: ClientRecord[] }) {
  const shown = dueWithin(clients, new Date(), 30).slice(0, 8);
  if (shown.length === 0) return null;
  return (
    <Card>
      <h2 className="text-xl font-semibold tracking-tight">Due in the next 30 days</h2>
      <ul className="mt-3 grid gap-1">
        {shown.map(({ client, obligation, today }) => {
          const { day, month } = dateParts(obligation.dueDate);
          const days = daysBetween(today, obligation.dueDate);
          return (
            <li key={`${client.id}:${obligation.id}`}>
              <Link
                to={`/entities/${client.id}/calendar`}
                className="group -mx-2 grid grid-cols-[48px_minmax(0,1fr)] items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150 ease-snappy hover:bg-panel-2 sm:-mx-3 sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:gap-4 sm:px-3"
              >
                <span className="grid justify-items-center rounded-xl bg-sun-soft py-1.5 text-sun">
                  <span className="font-display text-xl leading-6 font-semibold">{day}</span>
                  <span className="text-[11px] leading-4 font-semibold tracking-wide uppercase">{month}</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{obligation.label}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <span>{client.name}</span>
                    <JurisdictionBadge j={client.jurisdiction} />
                    <Countdown days={days} className="sm:hidden" />
                  </span>
                </span>
                <span className="hidden items-center gap-3 sm:flex">
                  <Countdown days={days} />
                  <ArrowRight
                    size={16}
                    aria-hidden
                    className="text-muted transition-transform duration-150 ease-snappy group-hover:translate-x-0.5 motion-reduce:transform-none"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
