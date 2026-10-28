import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProgressProvider } from '../progress/ProgressContext';

/** Render a page at a URL inside the same providers the app uses. */
export function renderAt(path: string, routePath: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProgressProvider>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </ProgressProvider>
    </MemoryRouter>,
  );
}
