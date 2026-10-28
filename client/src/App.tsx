import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Learn } from './pages/Learn';
import { NotFound } from './pages/NotFound';
import { KnowledgeLayout } from './pages/knowledge/KnowledgeLayout';
import { ClientRedirect, HubRedirect } from './components/Redirects';
import { KbGate } from './components/KbGate';

// Each page below loads on first visit, so the home page does not download the markdown renderer or every tool.
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}
const KnowledgeHome = page(() => import('./pages/knowledge/KnowledgeHome'), 'KnowledgeHome');
const Topic = page(() => import('./pages/Topic'), 'Topic');
const Compare = page(() => import('./pages/Compare'), 'Compare');
const Laws = page(() => import('./pages/knowledge/Laws'), 'Laws');
const LawDetailPage = page(() => import('./pages/knowledge/LawDetail'), 'LawDetailPage');
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
const WorkspaceSetup = page(() => import('./pages/workspace/WorkspaceSetup'), 'WorkspaceSetup');
const WorkspaceHome = page(() => import('./pages/workspace/WorkspaceHome'), 'WorkspaceHome');
const EntityDashboard = page(() => import('./pages/entity/EntityDashboard'), 'EntityDashboard');
const EntitySettings = page(() => import('./pages/entity/EntitySettings'), 'EntitySettings');
const EntityBooks = page(() => import('./pages/entity/EntityBooks'), 'EntityBooks');
const EntityReports = page(() => import('./pages/entity/EntityReports'), 'EntityReports');
const EntityDocuments = page(() => import('./pages/entity/EntityDocuments'), 'EntityDocuments');
const EntityCalendar = page(() => import('./pages/entity/EntityCalendar'), 'EntityCalendar');
const EntityRequests = page(() => import('./pages/entity/EntityRequests'), 'EntityRequests');
const AdminHome = page(() => import('./pages/admin/AdminHome'), 'AdminHome');
const AdminUsers = page(() => import('./pages/admin/AdminUsers'), 'AdminUsers');
const AdminKb = page(() => import('./pages/admin/AdminKb'), 'AdminKb');
const AdminKbSource = page(() => import('./pages/admin/AdminKbSource'), 'AdminKbSource');
const AdminKbNew = page(() => import('./pages/admin/AdminKbNew'), 'AdminKbNew');
const AdminKbVersion = page(() => import('./pages/admin/AdminKbVersion'), 'AdminKbVersion');
const AdminKbSearch = page(() => import('./pages/admin/AdminKbSearch'), 'AdminKbSearch');
const AdminFacts = page(() => import('./pages/admin/AdminFacts'), 'AdminFacts');
const AdminFactNew = page(() => import('./pages/admin/AdminFact'), 'AdminFactNew');
const AdminFactEdit = page(() => import('./pages/admin/AdminFact'), 'AdminFactEdit');

export function App() {
  return (
    <Suspense fallback={<p className="p-8 text-muted">Loading…</p>}>
      <KbGate>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="knowledge" element={<KnowledgeLayout />}>
              <Route index element={<KnowledgeHome />} />
              <Route path="learn" element={<Learn />} />
              <Route path="learn/:section/:slug" element={<Topic />} />
              <Route path="compare" element={<Compare />} />
              <Route path="laws" element={<Laws />} />
              <Route path="laws/:id" element={<LawDetailPage />} />
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
            </Route>
            <Route path="learn/*" element={<HubRedirect />} />
            <Route path="compare" element={<HubRedirect />} />
            <Route path="tools/*" element={<HubRedirect />} />
            <Route path="practice/*" element={<HubRedirect />} />
            <Route path="laws/*" element={<HubRedirect />} />
            <Route path="sign-in" element={<SignIn />} />
            <Route path="sign-up" element={<SignUp />} />
            <Route path="firm/new" element={<Navigate to="/workspace/new" replace />} />
            <Route path="workspace" element={<WorkspaceHome />} />
            <Route path="workspace/new" element={<WorkspaceSetup />} />
            <Route path="entities/:id" element={<EntityDashboard />} />
            <Route path="entities/:id/settings" element={<EntitySettings />} />
            <Route path="entities/:id/books" element={<EntityBooks />} />
            <Route path="entities/:id/reports" element={<EntityReports />} />
            <Route path="entities/:id/calendar" element={<EntityCalendar />} />
            <Route path="entities/:id/requests" element={<EntityRequests />} />
            <Route path="entities/:id/documents" element={<EntityDocuments />} />
            <Route path="business" element={<Navigate to="/workspace" replace />} />
            <Route path="clients" element={<Navigate to="/workspace" replace />} />
            <Route path="clients/:id" element={<ClientRedirect />} />
            <Route path="admin" element={<AdminHome />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/kb" element={<AdminKb />} />
            <Route path="admin/kb/sources/:id" element={<AdminKbSource />} />
            <Route path="admin/kb/new" element={<AdminKbNew />} />
            <Route path="admin/kb/search" element={<AdminKbSearch />} />
            <Route path="admin/kb/versions/:id" element={<AdminKbVersion />} />
            <Route path="admin/facts" element={<AdminFacts />} />
            <Route path="admin/facts/new" element={<AdminFactNew />} />
            <Route path="admin/facts/:key" element={<AdminFactEdit />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </KbGate>
    </Suspense>
  );
}
