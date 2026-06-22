import { type ReactNode, useState } from 'react';
import { AppBar, Box, Container, IconButton, Paper, Toolbar, Tooltip, Typography, BottomNavigation, BottomNavigationAction } from '@mui/material';
import { CalendarMonth, FormatListBulleted, BugReport, CloudDownload, PictureAsPdf, Logout, HelpOutline, Settings } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import UserSwitcher from './UserSwitcher';
import DownloadRosterDialog from './DownloadRosterDialog';
import NotificationBanner from './NotificationBanner';
import SettingsDialog from './SettingsDialog';

const NAV = [
  { label: 'Lista', icon: <FormatListBulleted />, path: '/' },
  { label: 'Calendário', icon: <CalendarMonth />, path: '/calendar' },
  { label: 'PDFs', icon: <PictureAsPdf />, path: '/pdfs' },
  { label: 'Debug', icon: <BugReport />, path: '/debug' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const current = NAV.findIndex((n) => n.path === location.pathname);
  const { sessionToken, setSessionToken } = useRoster();
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Box sx={{ pb: 8, minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ fontWeight: 700, flexGrow: 1 }}>
            CrewRoster Lite
          </Typography>
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
            <IconButton color="inherit" onClick={() => setSettingsOpen(true)}>
              <Settings />
            </IconButton>
          </Tooltip>
          <Tooltip title="Descarregar / atualizar escala">
            <IconButton color="inherit" onClick={() => setDownloadOpen(true)}>
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
      <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }} elevation={3}>
        <BottomNavigation
          showLabels
          value={current === -1 ? 0 : current}
          onChange={(_, idx) => navigate(NAV[idx].path)}
        >
          {NAV.map((n) => (
            <BottomNavigationAction key={n.path} label={n.label} icon={n.icon} />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
