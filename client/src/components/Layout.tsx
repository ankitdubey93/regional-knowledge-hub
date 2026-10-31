import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Menu, Moon, Sun, X } from 'lucide-react';
import { cx, TextLink } from './ui';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { ActiveEntityChip } from './ActiveEntityChip';
import { TimerChip } from './TimerChip';
import { useProgress } from '../progress/ProgressContext';
import { signOutUser, useSessionInfo } from '../lib/session';

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
      className="inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors duration-150 ease-snappy hover:bg-panel-2 hover:text-ink"
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
  cx(
    'rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-150 ease-snappy',
    isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-panel-2 hover:text-ink',
  );

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { persisted } = useProgress();
  const { session } = useSessionInfo();
  const nav = session
    ? [
        { to: '/workspace', label: 'Workspace' },
        { to: '/engagements', label: 'Engagements' },
        { to: '/time', label: 'Time' },
        { to: '/knowledge', label: 'Knowledge Hub' },
        ...(session.isAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
      ]
    : [{ to: '/knowledge', label: 'Knowledge Hub' }];

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
      <header className="sticky top-0 z-30 bg-panel/90 shadow-soft backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <Link to={session ? '/workspace' : '/'} className="mr-2 flex items-center gap-2 font-display text-[17px] font-bold">
            <span className="inline-flex size-7 items-center justify-center rounded-[9px] bg-accent text-accent-fg" aria-hidden>
              <BookOpen size={16} />
            </span>
            <span>Compliance Hub</span>
          </Link>
          <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center md:ml-0">
            {session ? (
              <>
                <div className="hidden items-center gap-2 sm:flex">
                  {session.activeFirmId !== null && <TimerChip />}
                  <ActiveEntityChip />
                  <WorkspaceSwitcher />
                </div>
                <button type="button" className="rounded-full px-3 py-2 text-sm font-semibold text-muted transition-colors duration-150 ease-snappy hover:bg-panel-2 hover:text-ink" onClick={async () => { await signOutUser(); navigate('/'); }}>
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/sign-in" className="rounded-full px-3 py-2 text-sm font-semibold text-muted transition-colors duration-150 ease-snappy hover:bg-panel-2 hover:text-ink">Sign in</Link>
            )}
            <ThemeToggle />
            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors duration-150 ease-snappy hover:bg-panel-2 md:hidden"
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
          <nav id="mobile-nav" aria-label="Main" className="animate-[menu-in_180ms_cubic-bezier(0.2,0.8,0.2,1)] space-y-1 border-t border-line bg-panel px-4 py-3 md:hidden">
            {session && (
              <div className="space-y-2 border-b border-line pb-2">
                {session.activeFirmId !== null && <TimerChip />}
                <ActiveEntityChip />
                <WorkspaceSwitcher inline />
              </div>
            )}
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => cx(linkClass({ isActive }), 'block')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-12">
        {!persisted && (
          <p className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-sm">This browser is blocking storage, so your practice data will be lost when you close the page.</p>
        )}
        <Outlet />
      </main>

      <footer className="shadow-[inset_0_1px_0_var(--border)]">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted sm:px-8">
          <p>
            Educational material, not tax, legal or accounting advice. Figures link to their official source with the date they were last checked; check the source
            before relying on a figure.
          </p>
          <nav aria-label="Legal" className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            <TextLink to="/legal/privacy">Privacy notice</TextLink>
            <TextLink to="/legal/terms">Terms of service</TextLink>
            <TextLink to="/legal/processing">Data processing terms</TextLink>
            <TextLink to="/legal/subprocessors">Sub-processors</TextLink>
          </nav>
        </div>
      </footer>
    </div>
  );
}
