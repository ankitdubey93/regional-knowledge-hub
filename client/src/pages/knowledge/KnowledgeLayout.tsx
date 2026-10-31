import { NavLink, Outlet } from 'react-router-dom';
import { ScopeBanner } from '../../components/ScopeBanner';
import { cx } from '../../components/ui';

const HUB_NAV = [
  { to: '/knowledge', label: 'Overview', end: true },
  { to: '/knowledge/learn', label: 'Learn', end: false },
  { to: '/knowledge/compare', label: 'Compare', end: false },
  { to: '/knowledge/laws', label: 'Laws', end: false },
  { to: '/knowledge/tools', label: 'Tools', end: false },
  { to: '/knowledge/practice', label: 'Practice', end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150 ease-snappy',
    isActive ? 'bg-panel text-ink shadow-soft' : 'text-muted hover:text-ink',
  );

export function KnowledgeLayout() {
  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <nav aria-label="Knowledge Hub" className="-mx-4 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
          <ul className="inline-flex gap-0.5 whitespace-nowrap rounded-full bg-panel-2 p-1">
            {HUB_NAV.map((n) => (
              <li key={n.to}>
                <NavLink end={n.end} to={n.to} className={linkClass}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <ScopeBanner />
      </div>
      <Outlet />
    </div>
  );
}
