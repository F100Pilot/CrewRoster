import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import RosterPage from './pages/RosterPage';
import CalendarPage from './pages/CalendarPage';
import DayDetailPage from './pages/DayDetailPage';
import DebugPage from './pages/DebugPage';
import LoginPage from './pages/LoginPage';
import { RosterProvider } from './state/RosterProvider';
import { useRoster } from './state/useRoster';

function AppRoutes() {
  const { roster, loading } = useRoster();
  const location = useLocation();

  if (loading) {
    return (
      <Layout>
        <Routes>
          <Route path="*" element={<RosterPage />} />
        </Routes>
      </Layout>
    );
  }

  // Login page is always accessible at /login, and is the default when no roster exists.
  const isLoginRoute = location.pathname === '/login';

  if (!roster && !isLoginRoute) {
    return (
      <Layout>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<RosterPage />} />
        <Route path="/login" element={<LoginPage />} />
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
