import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RosterPage from './pages/RosterPage';
import CalendarPage from './pages/CalendarPage';
import DayDetailPage from './pages/DayDetailPage';
import DebugPage from './pages/DebugPage';
import LoginPage from './pages/LoginPage';
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

  // RosterPage handles the no-roster case itself (upload dropzone + Login button),
  // so the routes are the same whether or not a roster exists.
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
