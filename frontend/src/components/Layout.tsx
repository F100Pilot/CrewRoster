import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
} from '@mui/material';
import {
  Home as HomeIcon,
  CalendarMonth as CalendarIcon,
  DateRange as RosterIcon,
  Notifications as NotificationsIcon,
  Person as PersonIcon,
} from '@mui/icons-material';

const navItems = [
  { path: '/', label: 'Home', icon: <HomeIcon /> },
  { path: '/roster', label: 'Roster', icon: <RosterIcon /> },
  { path: '/calendar', label: 'Calendar', icon: <CalendarIcon /> },
  { path: '/notifications', label: 'Alerts', icon: <NotificationsIcon /> },
  { path: '/profile', label: 'Profile', icon: <PersonIcon /> },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentValue = navItems.findIndex(
    (item) => item.path === location.pathname || (item.path !== '/' && location.pathname.startsWith(item.path))
  );
  const value = currentValue >= 0 ? currentValue : 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box sx={{ flex: 1, pb: 8 }}>
        <Outlet />
      </Box>
      <Paper
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
        elevation={3}
      >
        <BottomNavigation
          value={value}
          onChange={(_e, newValue) => {
            navigate(navItems[newValue].path);
          }}
          showLabels
        >
          {navItems.map((item) => (
            <BottomNavigationAction
              key={item.path}
              label={item.label}
              icon={item.icon}
            />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
