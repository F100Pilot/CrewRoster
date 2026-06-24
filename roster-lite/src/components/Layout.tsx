import { type ReactNode, useEffect, useState } from 'react';
import {
  AppBar, Box, Container, IconButton, Paper, Toolbar, Tooltip, Typography, BottomNavigation,
  BottomNavigationAction,
} from '@mui/material';
import {
  CalendarMonth, FormatListBulleted, CloudDownload, PictureAsPdf, Logout, HelpOutline,
  Settings, MenuBook, QueryStats, Public, Badge,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { APP_NAME, APP_VERSION_LABEL } from '../version';
import UserSwitcher from './UserSwitcher';
import DownloadRosterDialog from './DownloadRosterDialog';
import NotificationBanner from './NotificationBanner';
import SettingsDialog from './SettingsDialog';
import WhatsNewDialog from './WhatsNewDialog';
import { getTourSeen } from '../storage/settings';
import { startTour } from '../tour';

interface NavItem { label: string; icon: ReactNode; path: string }

const BASE_NAV: NavItem[] = [
  { label: 'Lista', icon: <FormatListBulleted />, path: '/' },
  { label: 'Calendário', icon: <CalendarMonth />, path: '/calendar' },
  { label: 'Diário', icon: <MenuBook />, path: '/logbook' },
  { label: 'Estatísticas', icon: <QueryStats />, path: '/stats' },
  { label: 'Mapa', icon: <Public />, path: '/map' },
  { label: 'Documentos', icon: <Badge />, path: '/documents' },
  { label: 'PDFs', icon: <PictureAsPdf />, path: '/pdfs' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionToken, setSessionToken, activeUser } = useRoster();
  // Logbook and documents are flight-crew oriented — hide their tabs for cabin crew.
  const NAV = activeUser?.role === 'cabin'
    ? BASE_NAV.filter((n) => n.path !== '/logbook' && n.path !== '/documents')
    : BASE_NAV;
  const current = NAV.findIndex((n) => n.path === location.pathname);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // First-run walkthrough: once a profile exists, run the guided tour a single time.
  // Delay so the AppBar/nav are painted (driver.js anchors to those elements).
  useEffect(() => {
    if (activeUser && !getTourSeen()) {
      const t = setTimeout(() => startTour(), 800);
      return () => clearTimeout(t);
    }
  }, [activeUser]);

  return (
    <Box sx={{ pb: 8, minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar variant="dense">
          {/* App name with the version stacked underneath. */}
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.15 }} noWrap>
              {APP_NAME}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', lineHeight: 1 }}>
              {APP_VERSION_LABEL}
            </Typography>
          </Box>
          {sessionToken && (
            <Tooltip title="Terminar sessão CrewLink">
              <IconButton
                color="inherit"
                onClick={() => setSessionToken(null)}
              >
                <Logout />
              </IconButton>
            </Tooltip>
          )}
          <UserSwitcher />
          <IconButton
            color="inherit"
            onClick={() => navigate('/codes')}
            title="Legenda de códigos"
          >
            <HelpOutline />
          </IconButton>
          <Tooltip title="Definições">
            <IconButton color="inherit" onClick={() => setSettingsOpen(true)} data-tour="settings">
              <Settings />
            </IconButton>
          </Tooltip>
          <Tooltip title="Descarregar / atualizar escala">
            <IconButton color="inherit" onClick={() => setDownloadOpen(true)} data-tour="download">
              <CloudDownload />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 2 }}>
        <NotificationBanner />
        {children}
      </Container>
      <DownloadRosterDialog open={downloadOpen} onClose={() => setDownloadOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WhatsNewDialog />
      {/* Seven tabs don't fit a phone width, so the bar scrolls horizontally. */}
      <Paper
        data-tour="nav"
        sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, overflowX: 'auto' }}
        elevation={3}
      >
        <BottomNavigation
          showLabels
          value={current === -1 ? 0 : current}
          onChange={(_, idx) => navigate(NAV[idx].path)}
          sx={{ width: 'max-content', minWidth: '100%' }}
        >
          {NAV.map((n) => (
            <BottomNavigationAction
              key={n.path}
              label={n.label}
              icon={n.icon}
              sx={{ minWidth: 72, px: 1 }}
            />
          ))}
        </BottomNavigation>
      </Paper>
      {/* Subtle edge fades hinting the bottom bar scrolls sideways. */}
      <Box
        sx={{
          position: 'fixed', bottom: 0, left: 0, width: 24, height: 56, zIndex: 1300,
          pointerEvents: 'none',
          background: (t) => `linear-gradient(to right, ${t.palette.background.paper}, transparent)`,
        }}
      />
      <Box
        sx={{
          position: 'fixed', bottom: 0, right: 0, width: 24, height: 56, zIndex: 1300,
          pointerEvents: 'none',
          background: (t) => `linear-gradient(to left, ${t.palette.background.paper}, transparent)`,
        }}
      />
    </Box>
  );
}
