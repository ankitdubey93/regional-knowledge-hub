import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Check, ChevronDown, Plus, Users } from 'lucide-react';
import { listWorkspaces, switchWorkspace, useSessionInfo, type WorkspaceSummary } from '../lib/session';

export function WorkspaceSwitcher({ inline = false }: { inline?: boolean }) {
  const { session } = useSessionInfo();
  const navigate = useNavigate();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape closes the panel and returns focus to the button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // A press outside the switcher closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  if (session === null) return null;

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setError(null);
    setWorkspaces(null);
    setWorkspaces(await listWorkspaces());
  };

  const choose = async (w: WorkspaceSummary) => {
    if (w.id === session.activeFirmId) {
      setOpen(false);
      return;
    }
    const message = await switchWorkspace(w.id);
    if (message !== null) {
      setError(message);
      return;
    }
    setOpen(false);
    navigate(w.kind === 'business' ? '/business' : '/clients');
  };

  const panelClass = inline
    ? 'mt-2 rounded-lg border border-line bg-panel p-2'
    : 'absolute right-0 z-40 mt-2 w-64 rounded-lg border border-line bg-panel p-2 shadow-lg';

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Workspace: ${session.activeFirmName ?? 'none'}`}
        onClick={() => void toggle()}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-panel-2 hover:text-ink"
      >
        <span className="max-w-40 truncate">{session.activeFirmName ?? 'No workspace'}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      <div id={panelId}>
        {open && (
          <div className={panelClass}>
            {error !== null && (
              <p role="alert" className="mb-2 px-2 text-sm text-bad">
                {error}
              </p>
            )}
            {workspaces === null ? (
              <p className="px-2 py-2 text-sm text-muted">Loading…</p>
            ) : (
              <ul>
                {workspaces.map((w) => {
                  const isActive = w.id === session.activeFirmId;
                  return (
                    <li key={w.id}>
                      <button
                        type="button"
                        aria-current={isActive ? 'true' : undefined}
                        onClick={() => void choose(w)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-panel-2"
                      >
                        {w.kind === 'business' ? <Building2 size={16} aria-hidden /> : <Users size={16} aria-hidden />}
                        <span className="min-w-0 flex-1 truncate">{w.name}</span>
                        {isActive && <Check size={16} aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              to="/workspace/new"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-accent hover:bg-panel-2"
            >
              <Plus size={16} aria-hidden />
              New workspace
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
