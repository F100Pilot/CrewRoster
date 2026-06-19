import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RosterPage from './pages/RosterPage';
import CalendarPage from './pages/CalendarPage';
import DayDetailPage from './pages/DayDetailPage';
import DebugPage from './pages/DebugPage';
import CodesPage from './pages/CodesPage';
import LoginPage from './pages/LoginPage';
import ImportPage from './pages/ImportPage';
import SavedPdfsPage from './pages/SavedPdfsPage';
import PdfViewerPage from './pages/PdfViewerPage';
import { RosterProvider } from './state/RosterProvider';
import { useRoster } from './state/useRoster';

function AppRoutes() {
  const { loading } = useRoster();

  if (loading) {
    return (
      <Layout>
        <Routes>
          <Route path="*" element={<RosterPage />} />
        </Routes>
      </Layout>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<RosterPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/pdfs" element={<SavedPdfsPage />} />
        <Route path="/pdf/:id" element={<PdfViewerPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/day/:date" element={<DayDetailPage />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="/codes" element={<CodesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

// HashRouter keeps client-side routing working on static hosts (e.g. GitHub Pages)
// without server rewrites.
export default function App() {
  return (
    <RosterProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </RosterProvider>
  );
}
