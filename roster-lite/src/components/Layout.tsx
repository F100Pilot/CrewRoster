import { type ReactNode, useState } from 'react';
import {
  AppBar, Box, Container, IconButton, Paper, Toolbar, Tooltip, Typography, BottomNavigation,
  BottomNavigationAction, Menu, MenuItem, ListItemIcon, ListItemText,
} from '@mui/material';
import {
  CalendarMonth, FormatListBulleted, CloudDownload, PictureAsPdf, Logout, HelpOutline,
  Settings, MenuBook, MoreVert, QueryStats, Public, Badge,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import UserSwitcher from './UserSwitcher';
import DownloadRosterDialog from './DownloadRosterDialog';
import NotificationBanner from './NotificationBanner';
import SettingsDialog from './SettingsDialog';

interface NavItem { label: string; icon: ReactNode; path: string }

const BASE_NAV: NavItem[] = [
  { label: 'Lista', icon: <FormatListBulleted />, path: '/' },
  { label: 'Calendário', icon: <CalendarMonth />, path: '/calendar' },
  { label: 'Diário', icon: <MenuBook />, path: '/logbook' },
  { label: 'PDFs', icon: <PictureAsPdf />, path: '/pdfs' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionToken, setSessionToken, activeUser } = useRoster();
  // The logbook is for flight crew only — hide its tab for cabin crew.
  const NAV = activeUser?.role === 'cabin'
    ? BASE_NAV.filter((n) => n.path !== '/logbook')
    : BASE_NAV;
  const current = NAV.findIndex((n) => n.path === location.pathname);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);
  const go = (path: string) => { setMoreAnchor(null); navigate(path); };

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
          <Tooltip title="Mais">
            <IconButton color="inherit" onClick={(e) => setMoreAnchor(e.currentTarget)}>
              <MoreVert />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={moreAnchor}
            open={Boolean(moreAnchor)}
            onClose={() => setMoreAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={() => go('/stats')}>
              <ListItemIcon><QueryStats fontSize="small" /></ListItemIcon>
              <ListItemText>Estatísticas</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => go('/map')}>
              <ListItemIcon><Public fontSize="small" /></ListItemIcon>
              <ListItemText>Mapa de voos</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => go('/documents')}>
              <ListItemIcon><Badge fontSize="small" /></ListItemIcon>
              <ListItemText>Documentos</ListItemText>
            </MenuItem>
          </Menu>
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
