import type { TAccountView } from '../utils/ledger';
import { formatPlain } from '../utils/money';

export function TAccount({ t, name }: { t: TAccountView; name: string }) {
  const rows = Math.max(t.debits.length, t.credits.length, 1);
  return (
    <figure className="rounded-lg border border-line bg-panel text-sm" aria-label={`T-account ${name}`}>
      <figcaption className="border-b-2 border-ink px-3 py-2 text-center font-medium">{name}</figcaption>
      <div className="grid grid-cols-2">
        <div className="border-r-2 border-ink">
          <p className="px-3 pt-1 text-xs text-muted">Dr</p>
          {Array.from({ length: rows }, (_, i) => (
            <p key={i} className="num px-3 py-0.5 text-right">
              {t.debits[i] !== undefined ? formatPlain(t.debits[i]) : ' '}
            </p>
          ))}
        </div>
        <div>
          <p className="px-3 pt-1 text-xs text-muted">Cr</p>
          {Array.from({ length: rows }, (_, i) => (
            <p key={i} className="num px-3 py-0.5 text-right">
              {t.credits[i] !== undefined ? formatPlain(t.credits[i]) : ' '}
            </p>
          ))}
        </div>
      </div>
      <p className="num border-t border-line px-3 py-1.5 text-right text-xs">
        Balance: {t.balanceCents === 0 ? '0.00' : `${formatPlain(Math.abs(t.balanceCents))} ${t.balanceCents > 0 ? 'Dr' : 'Cr'}`}
      </p>
    </figure>
  );
}
