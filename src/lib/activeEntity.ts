// The entity the user last opened, remembered per workspace. No import from session.ts (session.ts imports this file).
import { useMemo } from 'react';
import { z } from 'zod';
import type { Jurisdiction } from './entity';
import { useStored, writeStored } from './stored';

export interface ActiveEntity {
  workspaceId: string;
  id: string;
  name: string;
  jurisdiction: Jurisdiction;
}

export const ENTITY_KEY = 'rch.entity';

const entitySchema = z.object({
  workspaceId: z.string().min(1),
  id: z.string().min(1),
  name: z.string(),
  jurisdiction: z.enum(['AU', 'UK', 'AU+UK']),
});

export function parseActiveEntity(raw: string | null): ActiveEntity | null {
  if (raw === null) return null;
  try {
    const parsed = entitySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function setActiveEntity(e: ActiveEntity): void {
  writeStored('local', ENTITY_KEY, JSON.stringify(e));
}

export function clearActiveEntity(): void {
  writeStored('local', ENTITY_KEY, null);
  writeStored('session', 'rch.hubShowAll', null);
}

export function useStoredEntity(): ActiveEntity | null {
  const raw = useStored('local', ENTITY_KEY);
  return useMemo(() => parseActiveEntity(raw), [raw]);
}
