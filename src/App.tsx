import { lazy, Suspense, type ComponentType } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Learn } from './pages/Learn';
import { NotFound } from './pages/NotFound';

// Each page below loads on first visit, so the home page does not download the markdown renderer or every tool.
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}
const Topic = page(() => import('./pages/Topic'), 'Topic');
const Compare = page(() => import('./pages/Compare'), 'Compare');
const ToolsIndex = page(() => import('./pages/tools/ToolsIndex'), 'ToolsIndex');
const JournalPage = page(() => import('./pages/tools/JournalPage'), 'JournalPage');
const TaxPage = page(() => import('./pages/tools/TaxPage'), 'TaxPage');
const DepreciationPage = page(() => import('./pages/tools/DepreciationPage'), 'DepreciationPage');
const InventoryPage = page(() => import('./pages/tools/InventoryPage'), 'InventoryPage');
const CompanySizePage = page(() => import('./pages/tools/CompanySizePage'), 'CompanySizePage');
const PracticeIndex = page(() => import('./pages/practice/PracticeIndex'), 'PracticeIndex');
const QuizPage = page(() => import('./pages/practice/QuizPage'), 'QuizPage');
const FlashcardsPage = page(() => import('./pages/practice/FlashcardsPage'), 'FlashcardsPage');
const CodingPage = page(() => import('./pages/practice/CodingPage'), 'CodingPage');
const SignIn = page(() => import('./pages/auth/SignIn'), 'SignIn');
const SignUp = page(() => import('./pages/auth/SignUp'), 'SignUp');
const FirmSetup = page(() => import('./pages/firm/FirmSetup'), 'FirmSetup');
const Clients = page(() => import('./pages/firm/Clients'), 'Clients');

export function App() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Loading…</p>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="learn" element={<Learn />} />
          <Route path="learn/:section/:slug" element={<Topic />} />
          <Route path="compare" element={<Compare />} />
          <Route path="tools" element={<ToolsIndex />} />
          <Route path="tools/journal" element={<JournalPage />} />
          <Route path="tools/tax" element={<TaxPage />} />
          <Route path="tools/depreciation" element={<DepreciationPage />} />
          <Route path="tools/inventory" element={<InventoryPage />} />
          <Route path="tools/company-size" element={<CompanySizePage />} />
          <Route path="practice" element={<PracticeIndex />} />
          <Route path="practice/quiz/:section/:slug" element={<QuizPage />} />
          <Route path="practice/flashcards" element={<FlashcardsPage />} />
          <Route path="practice/coding" element={<CodingPage />} />
          <Route path="sign-in" element={<SignIn />} />
          <Route path="sign-up" element={<SignUp />} />
          <Route path="firm/new" element={<FirmSetup />} />
          <Route path="clients" element={<Clients />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
