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
    <div className="flex items-center gap-1 rounded-lg border border-line pl-2">
      <JurisdictionBadge j={e.jurisdiction} />
      <Link to={`/entities/${e.id}`} className="max-w-36 truncate px-1 py-1.5 text-sm font-medium hover:text-accent">
        {e.name}
      </Link>
      <button
        type="button"
        aria-label={`Clear selected entity ${e.name}`}
        onClick={clearActiveEntity}
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-panel-2 hover:text-ink"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
