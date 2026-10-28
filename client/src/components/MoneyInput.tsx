import { useId } from 'react';
import { parseMoney } from '@chub/shared/utils/money';
import { cx, inputClass } from './ui';

/** A text box for an amount. The parent keeps the raw text; `parse` turns it into cents (or null). */
export function MoneyInput({ label, value, onChange, prefix, hint }: { label: string; value: string; onChange: (v: string) => void; prefix?: string; hint?: string }) {
  const id = useId();
  const bad = value.trim() !== '' && parseMoney(value) === null;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{prefix}</span>}
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={bad}
          aria-describedby={bad || hint ? `${id}-msg` : undefined}
          className={cx(inputClass, 'num', prefix && 'pl-7', bad && 'border-bad')}
        />
      </div>
      {(bad || hint) && (
        <p id={`${id}-msg`} className={cx('mt-1 text-xs', bad ? 'text-bad' : 'text-muted')}>
          {bad ? 'Enter an amount like 1,100 or 1100.50' : hint}
        </p>
      )}
    </div>
  );
}

export function cents(v: string): number {
  return parseMoney(v) ?? 0;
}
