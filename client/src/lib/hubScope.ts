import { useStoredEntity } from './activeEntity';
import type { ActiveEntity } from './activeEntity';
import { scopeFor } from './scope';
import type { HubScope } from './scope';
import { useSessionInfo } from './session';
import { useStored, writeStored } from './stored';

export const SCOPE_KEY = 'rch.hubScope'; // localStorage: 'AU' | 'UK' | 'all'; anything else reads as 'all'
export const SHOW_ALL_KEY = 'rch.hubShowAll'; // sessionStorage: the entity id whose "show all" is on

/** The stored entity if it belongs to the active workspace, else null. */
export function useActiveEntity(): ActiveEntity | null {
  const stored = useStoredEntity();
  const { session } = useSessionInfo();
  if (stored === null || session === null || session.activeFirmId !== stored.workspaceId) return null;
  return stored;
}

export interface HubScopeState {
  scope: HubScope;
  entity: ActiveEntity | null;
  entityScope: HubScope | null;
  showingAll: boolean;
  setManual: (s: HubScope) => void;
  showAll: () => void;
  resetToEntity: () => void;
}

/** With an entity: scope = showingAll ? 'all' : entityScope. Without: the stored manual scope, default 'all'. */
export function useHubScope(): HubScopeState {
  const entity = useActiveEntity();
  const manualRaw = useStored('local', SCOPE_KEY);
  const showAllRaw = useStored('session', SHOW_ALL_KEY);
  const manual: HubScope = manualRaw === 'AU' || manualRaw === 'UK' ? manualRaw : 'all';
  const entityScope = entity === null ? null : scopeFor(entity.jurisdiction);
  const showingAll = entity !== null && showAllRaw === entity.id;
  const scope: HubScope = entityScope === null ? manual : showingAll ? 'all' : entityScope;
  return {
    scope,
    entity,
    entityScope,
    showingAll,
    setManual: (s) => writeStored('local', SCOPE_KEY, s),
    showAll: () => {
      if (entity !== null) writeStored('session', SHOW_ALL_KEY, entity.id);
    },
    resetToEntity: () => writeStored('session', SHOW_ALL_KEY, null),
  };
}
