import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { vi } from 'vitest';
import { setFacts } from '../data/facts';
import { setDocs } from '../content/docs';
import { seedFacts, seedSiteDocs } from './seedData';

// Every test starts with the facts and docs loaded, as the app does after /api/kb/site.
setFacts(seedFacts);
setDocs(seedSiteDocs);

// No component test talks to the auth server; each test sets the session it needs.
vi.mock('../lib/session', () => ({
  useSessionInfo: vi.fn(() => ({ session: null, pending: false })),
  signInEmail: vi.fn(async () => null),
  signUpEmail: vi.fn(async () => ({ ok: true, checkEmail: false })),
  createWorkspace: vi.fn(async () => null),
  listWorkspaces: vi.fn(async () => []),
  switchWorkspace: vi.fn(async () => null),
  signOutUser: vi.fn(async () => undefined),
}));

// Unmount before anything else is restored, so no test leaks into the next.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* jsdom always has storage; ignore elsewhere */
  }
});
