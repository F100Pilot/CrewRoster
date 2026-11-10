import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AppBar, Box, Container, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Paper,
  Toolbar, Tooltip, Typography, BottomNavigation, BottomNavigationAction,
} from '@mui/material';
import {
  CalendarMonth, FormatListBulleted, CloudDownload, PictureAsPdf, Logout, HelpOutline, Timer,
  Settings, MenuBook, QueryStats, Public, Badge, Search, MoreVert, Gavel, Payments, FlightTakeoff,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { APP_NAME, APP_VERSION_LABEL } from '../version';
import UserSwitcher from './UserSwitcher';
import DownloadRosterDialog from './DownloadRosterDialog';
import NotificationBanner from './NotificationBanner';
import SettingsDialog from './SettingsDialog';
import WhatsNewDialog from './WhatsNewDialog';
import DisclaimerDialog from './DisclaimerDialog';
import { getPaySettings, getTourSeen } from '../storage/settings';
import { OPEN_SETTINGS_EVENT } from './settingsEvents';
// The guided tour (driver.js, ~20 KB) loads only when it runs.
const startTour = () => { void import('../tour').then((m) => m.startTour()); };

interface NavItem { label: string; icon: ReactNode; path: string }

const BASE_NAV: NavItem[] = [
  { label: 'Hoje', icon: <FlightTakeoff />, path: '/' },
  { label: 'Lista', icon: <FormatListBulleted />, path: '/lista' },
  { label: 'Calendário', icon: <CalendarMonth />, path: '/calendar' },
  { label: 'Diário', icon: <MenuBook />, path: '/logbook' },
  { label: 'Estatísticas', icon: <QueryStats />, path: '/stats' },
  { label: 'Mapa', icon: <Public />, path: '/map' },
  { label: 'Documentos', icon: <Badge />, path: '/documents' },
  { label: 'PDFs', icon: <PictureAsPdf />, path: '/pdfs' },
];

const PILOT_AE_NAV: NavItem = { label: 'AE', icon: <Gavel />, path: '/limites' };
const PILOT_PAY_NAV: NavItem = { label: 'Vencimento', icon: <Payments />, path: '/vencimento' };

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionToken, setSessionToken, activeUser } = useRoster();
  const cabin = activeUser?.role === 'cabin';
  // The pay tab shows only once the pilot turned the estimate on (off by default).
  const [payOn, setPayOn] = useState(false);
  useEffect(() => {
    const reload = () => setPayOn(!!activeUser && !cabin && getPaySettings(activeUser.id).enabled);
    reload();
    window.addEventListener('pay-settings-updated', reload);
    return () => window.removeEventListener('pay-settings-updated', reload);
  }, [activeUser, cabin]);
  // Logbook and documents are flight-crew oriented — hide their tabs for cabin crew. Pilots get
  // the AE limits and the pay estimate as tabs of their own, next to Stats (all the "numbers"
  // together); both follow the SIPLA agreement, which covers pilots only.
  const NAV = cabin
    ? BASE_NAV.filter((n) => n.path !== '/logbook' && n.path !== '/documents')
    : BASE_NAV.flatMap((n) => n.path === '/stats'
      ? [n, PILOT_AE_NAV, ...(payOn ? [PILOT_PAY_NAV] : [])]
      : [n]);
  const current = NAV.findIndex((n) => n.path === location.pathname);
  // With eight or nine tabs the active one can sit off-screen — slide the bar so it's visible.
  const navRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = navRef.current;
    const el = bar?.querySelector<HTMLElement>('.Mui-selected');
    if (!bar || !el) return;
    const left = el.offsetLeft - bar.offsetLeft;
    if (left < bar.scrollLeft || left + el.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollTo({ left: left - (bar.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
    }
  }, [current, NAV.length]);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Pages can ask for Settings on a given tab (see settingsEvents.ts).
  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener(OPEN_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, open);
  }, []);
  // Overflow menu for the rarely-used actions: on a phone the toolbar had one icon too many
  // and squeezed the app name to "CrewRos…", so only the frequent actions stay on the bar.
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);

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
          <UserSwitcher />
          <Tooltip title="Pesquisar">
            <IconButton size="small" color="inherit" onClick={() => navigate('/search')} aria-label="Pesquisar">
              <Search />
            </IconButton>
          </Tooltip>
          <Tooltip title="Definições">
            <IconButton size="small" color="inherit" onClick={() => setSettingsOpen(true)} data-tour="settings">
              <Settings />
            </IconButton>
          </Tooltip>
          <Tooltip title="Descarregar / atualizar escala">
            <IconButton size="small" color="inherit" onClick={() => setDownloadOpen(true)} data-tour="download">
              <CloudDownload />
            </IconButton>
          </Tooltip>
          <Tooltip title="Mais">
            <IconButton
              size="small" color="inherit" aria-label="Mais opções"
              onClick={(e) => setMoreAnchor(e.currentTarget)}
            >
              <MoreVert />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
            {/* Pilots have the AE limits as a bottom tab; cabin crew reach their EASA limits here. */}
            {cabin && (
              <MenuItem onClick={() => { setMoreAnchor(null); navigate('/limites'); }}>
                <ListItemIcon><Timer fontSize="small" /></ListItemIcon>
                <ListItemText>Limites</ListItemText>
              </MenuItem>
            )}
            <MenuItem onClick={() => { setMoreAnchor(null); navigate('/codes'); }}>
              <ListItemIcon><HelpOutline fontSize="small" /></ListItemIcon>
              <ListItemText>Legenda de códigos</ListItemText>
            </MenuItem>
            {sessionToken && (
              <MenuItem onClick={() => { setMoreAnchor(null); setSessionToken(null); }}>
                <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
                <ListItemText>Terminar sessão CrewLink</ListItemText>
              </MenuItem>
            )}
          </Menu>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 2 }}>
        <NotificationBanner />
        {children}
      </Container>
      <DownloadRosterDialog open={downloadOpen} onClose={() => setDownloadOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WhatsNewDialog />
      <DisclaimerDialog />
      {/* Seven to nine tabs don't fit a phone width, so the bar scrolls horizontally. */}
      <Paper
        data-tour="nav"
        ref={navRef}
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
