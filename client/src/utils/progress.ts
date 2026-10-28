import type { CardState } from './srs';

/**
 * Everything the learner has done, kept in one localStorage key. Storage can
 * be missing or throw (private windows, blocked site data), so every access is
 * wrapped and the app works without it; progress is then lost on reload.
 */
export interface Progress {
  version: 1;
  quiz: Record<string, { best: number; total: number; last: string }>; // doc id -> best score
  cards: Record<string, CardState>; // flashcard id -> Leitner state
  journal: Record<string, boolean>; // scenario id -> solved
  coding: Record<string, boolean>; // scenario id -> right first time or not
  checklist: Record<string, boolean>; // "checklistId:itemId" -> ticked
}

export const STORAGE_KEY = 'rch.progress.v1';

export function emptyProgress(): Progress {
  return { version: 1, quiz: {}, cards: {}, journal: {}, coding: {}, checklist: {} };
}

/** Parse stored JSON; anything malformed is dropped rather than crashing the app. */
export function parseProgress(raw: string | null): Progress {
  if (!raw) return emptyProgress();
  try {
    const p = JSON.parse(raw) as Partial<Progress>;
    if (p.version !== 1) return emptyProgress();
    // Keep only the keys we still use, so fields dropped in an update (read, lastDoc) are not saved back.
    const base = emptyProgress();
    return {
      version: 1,
      quiz: p.quiz ?? base.quiz,
      cards: p.cards ?? base.cards,
      journal: p.journal ?? base.journal,
      coding: p.coding ?? base.coding,
      checklist: p.checklist ?? base.checklist,
    };
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
