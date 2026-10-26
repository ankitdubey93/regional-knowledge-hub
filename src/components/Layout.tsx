import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Menu, Moon, Sun, X } from 'lucide-react';
import { cx } from './ui';
import { useProgress } from '../progress/ProgressContext';

const NAV = [
  { to: '/learn', label: 'Learn' },
  { to: '/compare', label: 'Compare' },
  { to: '/tools', label: 'Tools' },
  { to: '/practice', label: 'Practice' },
  { to: '/progress', label: 'Progress' },
];

function currentTheme(): 'light' | 'dark' {
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced === 'light' || forced === 'dark') return forced;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => currentTheme());
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-panel-2 hover:text-ink"
      onClick={() => {
        document.documentElement.setAttribute('data-theme', next);
        try {
          localStorage.setItem('rch.theme', next);
        } catch {
          /* the choice lasts for this page only */
        }
        setTheme(next);
      }}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cx('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-panel-2 hover:text-ink');

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { persisted } = useProgress();

  useEffect(() => {
    setOpen(false);
    window.scrollTo?.(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-panel focus:p-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-panel/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <Link to="/" className="mr-2 flex items-center gap-2 font-semibold">
            <BookOpen size={20} className="text-accent" aria-hidden />
            <span>Compliance Hub</span>
          </Link>
          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center md:ml-0">
            <ThemeToggle />
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-panel-2 md:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-line bg-panel px-4 py-2 md:hidden">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => cx(linkClass({ isActive }), 'block')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">
        {!persisted && (
          <p className="mb-4 rounded-lg bg-warn-soft p-3 text-sm">This browser is blocking storage, so your progress will be lost when you close the page.</p>
        )}
        <Outlet />
      </main>

      <footer className="border-t border-line bg-panel">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted">
          <p>
            Educational material, not tax, legal or accounting advice. Figures link to their official source with the date they were last checked; check the source
            before relying on a figure.
          </p>
        </div>
      </footer>
    </div>
  );
}
