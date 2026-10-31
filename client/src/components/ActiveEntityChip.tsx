import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { JurisdictionBadge } from './ui';
import { clearActiveEntity } from '../lib/activeEntity';
import { useActiveEntity } from '../lib/hubScope';

/** The entity the user last opened, so the header shows what the Knowledge Hub is filtered by. */
export function ActiveEntityChip() {
  const e = useActiveEntity();
  if (e === null) return null;
  return (
    <div className="flex items-center gap-1 rounded-full bg-panel-2 pl-2.5">
      <JurisdictionBadge j={e.jurisdiction} />
      <Link to={`/entities/${e.id}`} className="max-w-36 truncate px-1 py-1.5 text-sm font-semibold transition-colors duration-150 ease-snappy hover:text-accent">
        {e.name}
      </Link>
      <button
        type="button"
        aria-label={`Clear selected entity ${e.name}`}
        onClick={clearActiveEntity}
        className="inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors duration-150 ease-snappy hover:bg-accent-soft hover:text-ink"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
