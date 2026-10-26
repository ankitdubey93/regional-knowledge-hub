import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Jurisdiction } from '../data/schemas';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-line bg-panel text-ink hover:bg-panel-2',
  ghost: 'text-ink hover:bg-panel-2',
};

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  // min-w-0 lets a card shrink inside a grid, so a wide table scrolls inside it instead of widening the page.
  return <section className={cx('min-w-0 rounded-xl border border-line bg-panel p-4 sm:p-6', className)}>{children}</section>;
}

export function PageHeader({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 sm:mb-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {lead && <p className="mt-2 max-w-3xl text-muted">{lead}</p>}
      {children}
    </header>
  );
}

const jurisdictionStyle: Record<string, string> = {
  AU: 'bg-au-soft text-au',
  UK: 'bg-uk-soft text-uk',
  INTL: 'bg-panel-2 text-muted',
  'AU+UK': 'bg-accent-soft text-accent',
};
const jurisdictionLabel: Record<string, string> = { AU: 'Australia', UK: 'UK', INTL: 'International', 'AU+UK': 'AU & UK' };

export function JurisdictionBadge({ j }: { j: Jurisdiction | 'AU+UK' }) {
  return <span className={cx('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', jurisdictionStyle[j])}>{jurisdictionLabel[j]}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex flex-wrap gap-1 rounded-lg border border-line bg-panel-2 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx('min-h-9 rounded-md px-3 text-sm font-medium', value === t.id ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-panel px-3 py-2 text-base text-ink placeholder:text-muted sm:text-sm';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** A horizontally scrollable wrapper so wide tables never make the page scroll sideways. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">{children}</div>;
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-accent underline underline-offset-2 hover:text-accent-hover">
      {children}
    </Link>
  );
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'good' | 'bad' | 'warn'; children: ReactNode }) {
  const tones = { info: 'border-line bg-panel-2', good: 'border-good bg-good-soft', bad: 'border-bad bg-bad-soft', warn: 'border-warn bg-warn-soft' };
  return <div className={cx('rounded-lg border-l-4 p-3 text-sm', tones[tone])}>{children}</div>;
}
