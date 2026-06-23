import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ErrorOutline, Refresh } from '@mui/icons-material';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import RosterPage from './pages/RosterPage';
import CalendarPage from './pages/CalendarPage';
import DayDetailPage from './pages/DayDetailPage';
import LogbookPage from './pages/LogbookPage';
import StatsPage from './pages/StatsPage';
import MapPage from './pages/MapPage';
import DocumentsPage from './pages/DocumentsPage';
import DebugPage from './pages/DebugPage';
import CodesPage from './pages/CodesPage';
import LoginPage from './pages/LoginPage';
import ImportPage from './pages/ImportPage';
import SavedPdfsPage from './pages/SavedPdfsPage';
import PdfViewerPage from './pages/PdfViewerPage';
import WelcomePage from './pages/WelcomePage';
import { RosterProvider } from './state/RosterProvider';
import { useRoster } from './state/useRoster';

function LoadErrorScreen({ message }: { message: string }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'background.default' }}>
      <Stack spacing={2} alignItems="center" sx={{ maxWidth: 420, textAlign: 'center' }}>
        <ErrorOutline color="error" sx={{ fontSize: 48 }} />
        <Typography variant="h6">Não foi possível carregar os dados</Typography>
        <Typography variant="body2" color="text.secondary">
          Houve um problema a ler os dados guardados neste dispositivo. Não foram apagados —
          tenta recarregar. Se persistir, fecha e reabre a aplicação.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>{message}</Typography>
        <Button variant="contained" startIcon={<Refresh />} onClick={() => window.location.reload()}>
          Recarregar
        </Button>
      </Stack>
    </Box>
  );
}

function AppRoutes() {
  const { loading, users, loadError } = useRoster();

  if (loading) {
    return (
      <Layout>
        <Routes>
          <Route path="*" element={<RosterPage />} />
        </Routes>
      </Layout>
    );
  }

  // A failed initial load is not a fresh install — show a recoverable error, never onboarding.
  if (loadError) {
    return <LoadErrorScreen message={loadError} />;
  }

  // First launch or all users deleted — show onboarding
  if (users.length === 0) {
    return <WelcomePage />;
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
        <Route path="/logbook" element={<LogbookPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/debug" element={<DebugPage />} />
        <Route path="/codes" element={<CodesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <RosterProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </RosterProvider>
    </ErrorBoundary>
  );
}
