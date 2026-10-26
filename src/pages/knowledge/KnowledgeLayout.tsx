import { NavLink, Outlet } from 'react-router-dom';
import { ScopeBanner } from '../../components/ScopeBanner';
import { cx } from '../../components/ui';

const HUB_NAV = [
  { to: '/knowledge', label: 'Overview', end: true },
  { to: '/knowledge/learn', label: 'Learn', end: false },
  { to: '/knowledge/compare', label: 'Compare', end: false },
  { to: '/knowledge/tools', label: 'Tools', end: false },
  { to: '/knowledge/practice', label: 'Practice', end: false },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cx('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-panel-2 hover:text-ink');

export function KnowledgeLayout() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-accent">Knowledge Hub</p>
        <nav aria-label="Knowledge Hub" className="-mx-4 mt-2 overflow-x-auto px-4">
          <ul className="flex gap-1 whitespace-nowrap">
            {HUB_NAV.map((n) => (
              <li key={n.to}>
                <NavLink end={n.end} to={n.to} className={linkClass}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <ScopeBanner />
      <Outlet />
    </div>
  );
}
