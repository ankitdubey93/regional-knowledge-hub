// A tiny pub/sub over Web Storage. The snapshot is the raw string, so it is stable for useSyncExternalStore.
import { useSyncExternalStore } from 'react';

export type Area = 'local' | 'session';

const listeners = new Set<() => void>();

function areaOf(area: Area): Storage {
  return area === 'local' ? localStorage : sessionStorage;
}

export function readStored(area: Area, key: string): string | null {
  try {
    return areaOf(area).getItem(key);
  } catch {
    return null;
  }
}

/** null removes the key. */
export function writeStored(area: Area, key: string, value: string | null): void {
  try {
    if (value === null) areaOf(area).removeItem(key);
    else areaOf(area).setItem(key, value);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
  listeners.forEach((l) => l());
}

export function subscribeStored(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStored(area: Area, key: string): string | null {
  return useSyncExternalStore(
    subscribeStored,
    () => readStored(area, key),
    () => null,
  );
}
