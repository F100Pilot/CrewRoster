import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { ErrorOutline, Refresh } from '@mui/icons-material';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import RosterPage from './pages/RosterPage';
import CalendarPage from './pages/CalendarPage';
import DayDetailPage from './pages/DayDetailPage';
import WelcomePage from './pages/WelcomePage';
import { RosterProvider } from './state/RosterProvider';
import { useRoster } from './state/useRoster';

// Secondary routes are code-split so their heavy deps (d3-geo + world-atlas on the map,
// pdf.js on the viewer, the stats/logbook math) don't weigh down the first load.
const LogbookPage = lazy(() => import('./pages/LogbookPage'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const MapPage = lazy(() => import('./pages/MapPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const DebugPage = lazy(() => import('./pages/DebugPage'));
const CodesPage = lazy(() => import('./pages/CodesPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const SavedPdfsPage = lazy(() => import('./pages/SavedPdfsPage'));
const PdfViewerPage = lazy(() => import('./pages/PdfViewerPage'));

function RouteFallback() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
      <CircularProgress />
    </Box>
  );
}

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
      <Suspense fallback={<RouteFallback />}>
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
      </Suspense>
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
