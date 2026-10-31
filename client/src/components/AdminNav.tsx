import { NavLink } from 'react-router-dom';
import { cx } from './ui';

const links = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users', end: false },
  { to: '/admin/kb', label: 'Knowledge base', end: false },
  { to: '/admin/facts', label: 'Facts', end: false },
  { to: '/admin/kb/search', label: 'Test search', end: false },
];

export function AdminNav() {
  return (
    <nav aria-label="Admin" className="mb-8 inline-flex flex-wrap gap-0.5 rounded-3xl bg-panel-2 p-1">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) =>
            cx(
              'inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150 ease-snappy',
              isActive ? 'bg-panel text-ink shadow-soft' : 'text-muted hover:text-ink',
            )
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
