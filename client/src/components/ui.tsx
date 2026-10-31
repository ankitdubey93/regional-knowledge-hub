import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Jurisdiction } from '@chub/shared/data/schemas';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg enabled:hover:-translate-y-px enabled:hover:bg-accent-hover enabled:hover:shadow-btn',
  secondary: 'bg-panel-2 text-ink enabled:hover:bg-accent-soft enabled:hover:text-accent',
  ghost: 'text-ink enabled:hover:bg-panel-2',
};

/** Hover and press motion shared by buttons and button-like links: 150 ms on one curve, no movement under reduced motion. */
export const motionClass = 'transition-[background-color,color,transform,box-shadow] duration-150 ease-snappy motion-reduce:transform-none';

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
        motionClass,
        variants[variant],
        className,
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  // min-w-0 lets a card shrink inside a grid, so a wide table scrolls inside it instead of widening the page.
  return <section className={cx('min-w-0 rounded-3xl bg-panel p-5 shadow-soft sm:p-8', className)}>{children}</section>;
}

/** A card that is a link: lifts on hover and settles on press. */
export const cardLinkClass =
  'block h-full rounded-3xl bg-panel p-6 shadow-soft transition-[transform,box-shadow] duration-150 ease-snappy hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0 motion-reduce:transform-none';

export function PageHeader({ title, lead, eyebrow, children }: { title: string; lead?: ReactNode; eyebrow?: string; children?: ReactNode }) {
  return (
    <header className="mb-8 sm:mb-12">
      {eyebrow && <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-accent">{eyebrow}</p>}
      <h1 className="text-[28px] leading-9 font-semibold tracking-tight sm:text-[38px] sm:leading-[46px]">{title}</h1>
      {lead && <p className="mt-3 max-w-3xl text-[17px] leading-7 text-muted">{lead}</p>}
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
  return <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', jurisdictionStyle[j])}>{jurisdictionLabel[j]}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-4 inline-flex flex-wrap gap-0.5 rounded-3xl bg-panel-2 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'min-h-9 rounded-full px-4 text-sm font-semibold transition-[background-color,color,box-shadow] duration-150 ease-snappy',
            value === t.id ? 'bg-panel text-ink shadow-soft' : 'text-muted hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const inputClass =
  'min-h-10 w-full rounded-xl border-[1.5px] border-line bg-panel px-3 py-2 text-base text-ink transition-colors duration-150 ease-snappy placeholder:text-muted hover:border-muted focus:border-accent sm:text-sm';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
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
    <Link
      to={to}
      className="font-semibold text-accent underline decoration-1 underline-offset-[3px] transition-colors duration-150 ease-snappy hover:text-accent-hover hover:decoration-2"
    >
      {children}
    </Link>
  );
}

const calloutTones = { info: 'bg-panel-2', good: 'bg-good-soft', bad: 'bg-bad-soft', warn: 'bg-warn-soft' };
const calloutLabelTones = { info: 'text-muted', good: 'text-good', bad: 'text-bad', warn: 'text-warn' };

/** A tinted panel; an optional label ("Not checked", "Error") leads in the tone's colour, so the colour never stands alone. */
export function Callout({ tone = 'info', label, children }: { tone?: 'info' | 'good' | 'bad' | 'warn'; label?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-xl px-4 py-3 text-sm', calloutTones[tone])}>
      {label && <span className={cx('mr-2 text-xs font-semibold uppercase tracking-wide', calloutLabelTones[tone])}>{label}</span>}
      {children}
    </div>
  );
}
