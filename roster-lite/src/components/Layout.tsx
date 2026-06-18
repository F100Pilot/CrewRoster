import { type ReactNode } from 'react';
import { AppBar, Box, Container, Paper, Toolbar, Typography, BottomNavigation, BottomNavigationAction } from '@mui/material';
import { CalendarMonth, FormatListBulleted, BugReport } from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';

const NAV = [
  { label: 'Lista', icon: <FormatListBulleted />, path: '/' },
  { label: 'Calendário', icon: <CalendarMonth />, path: '/calendar' },
  { label: 'Debug', icon: <BugReport />, path: '/debug' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const current = NAV.findIndex((n) => n.path === location.pathname);

  return (
    <Box sx={{ pb: 8, minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar variant="dense">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            CrewRoster Lite
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 2 }}>
        {children}
      </Container>
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
