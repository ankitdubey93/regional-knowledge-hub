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
    <nav aria-label="Admin" className="mb-6 flex flex-wrap gap-2">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) =>
            cx('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-panel-2 hover:text-ink')
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
