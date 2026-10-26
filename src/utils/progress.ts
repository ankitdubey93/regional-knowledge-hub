import type { CardState } from './srs';

/**
 * Everything the learner has done, kept in one localStorage key. Storage can
 * be missing or throw (private windows, blocked site data), so every access is
 * wrapped and the app works without it; progress is then lost on reload.
 */
export interface Progress {
  version: 1;
  read: Record<string, string>; // doc id -> ISO date first marked read
  quiz: Record<string, { best: number; total: number; last: string }>; // doc id -> best score
  cards: Record<string, CardState>; // flashcard id -> Leitner state
  journal: Record<string, boolean>; // scenario id -> solved
  coding: Record<string, boolean>; // scenario id -> right first time or not
  checklist: Record<string, boolean>; // "checklistId:itemId" -> ticked
  lastDoc: string | null;
}

export const STORAGE_KEY = 'rch.progress.v1';

export function emptyProgress(): Progress {
  return { version: 1, read: {}, quiz: {}, cards: {}, journal: {}, coding: {}, checklist: {}, lastDoc: null };
}

/** Parse stored JSON; anything malformed is dropped rather than crashing the app. */
export function parseProgress(raw: string | null): Progress {
  if (!raw) return emptyProgress();
  try {
    const p = JSON.parse(raw) as Partial<Progress>;
    if (p.version !== 1) return emptyProgress();
    return { ...emptyProgress(), ...p };
  } catch {
    return emptyProgress();
  }
}

export function loadProgress(): Progress {
  try {
    return parseProgress(localStorage.getItem(STORAGE_KEY));
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
