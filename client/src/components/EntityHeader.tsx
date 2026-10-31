import { Link, NavLink } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { profileSummary, type ClientRecord } from '../lib/entity';
import { JurisdictionBadge, cx } from './ui';

const TABS = [
  { path: '', label: 'Overview' },
  { path: '/books', label: 'Books' },
  { path: '/reports', label: 'Reports' },
  { path: '/documents', label: 'Documents' },
  { path: '/calendar', label: 'Calendar' },
  { path: '/requests', label: 'Requests' },
  { path: '/engagements', label: 'Engagements' },
  { path: '/settings', label: 'Settings' },
];

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 ease-snappy',
    isActive ? 'bg-panel text-ink shadow-soft' : 'text-muted hover:text-ink',
  );

/**
 * The header every client page shares: the way back, the client's name and profile, and a tab per client page.
 * The name is the page's h1 only on the overview; elsewhere the page's own PageHeader holds the h1.
 */
export function EntityHeader({ client, overview = false }: { client: ClientRecord; overview?: boolean }) {
  const summary = profileSummary(client);
  const Name = overview ? 'h1' : 'p';
  return (
    <div className="mb-8 space-y-4 sm:mb-10">
      <Link
        to="/workspace"
        className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors duration-150 ease-snappy hover:text-accent"
      >
        <ArrowLeft size={14} aria-hidden className="transition-transform duration-150 ease-snappy group-hover:-translate-x-0.5 motion-reduce:transform-none" />
        Workspace
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Name className="font-display text-[28px] leading-8 font-semibold tracking-tight sm:text-4xl sm:leading-[44px]">{client.name}</Name>
        <JurisdictionBadge j={client.jurisdiction} />
      </div>
      {summary !== '' && <p className="text-[15px] text-muted">{summary}</p>}
      <div className="-mx-4 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
        <nav aria-label={client.name} className="inline-flex gap-0.5 rounded-full bg-panel-2 p-1">
          {TABS.map((t) => (
            <NavLink key={t.label} to={`/entities/${client.id}${t.path}`} end={t.path === ''} className={tabClass}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
