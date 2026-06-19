import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RosterPage from './pages/RosterPage';
import CalendarPage from './pages/CalendarPage';
import DayDetailPage from './pages/DayDetailPage';
import DebugPage from './pages/DebugPage';
import LoginPage from './pages/LoginPage';
import { RosterProvider } from './state/RosterProvider';
import { useRoster } from './state/useRoster';
import { useState } from 'react';

// Inner component that can access RosterContext (must be inside RosterProvider).
function AppRoutes() {
  const { roster, loading } = useRoster();
  const [showUpload, setShowUpload] = useState(false);

  // While hydrating from IndexedDB, show nothing (RosterPage handles its own loading).
  if (loading) {
    return (
      <Layout>
        <Routes>
          <Route path="*" element={<RosterPage />} />
        </Routes>
      </Layout>
    );
  }

  // No roster loaded yet: show login page (with option to switch to manual upload).
  // If the user chose manual upload, fall through to the normal RosterPage which
  // shows the UploadDropzone.
  if (!roster && !showUpload) {
    return (
      <Layout>
        <Routes>
          <Route
            path="/"
            element={<LoginPage onSwitchToUpload={() => setShowUpload(true)} />}
          />
          {/* Allow deep-links to still work even without a roster */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<RosterPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/day/:date" element={<DayDetailPage />} />
        <Route path="/debug" element={<DebugPage />} />
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
