import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RosterPage from './pages/RosterPage';
import CalendarPage from './pages/CalendarPage';
import DayDetailPage from './pages/DayDetailPage';
import DebugPage from './pages/DebugPage';
import { RosterProvider } from './state/RosterProvider';

// HashRouter keeps client-side routing working on static hosts (e.g. GitHub Pages)
// without server rewrites.
export default function App() {
  return (
    <RosterProvider>
      <HashRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<RosterPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/day/:date" element={<DayDetailPage />} />
            <Route path="/debug" element={<DebugPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </HashRouter>
    </RosterProvider>
  );
}
