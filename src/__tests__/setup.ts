import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount before anything else is restored, so no test leaks into the next.
afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* jsdom always has storage; ignore elsewhere */
  }
});
