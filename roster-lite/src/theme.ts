import { createTheme } from '@mui/material/styles';

// Ported from frontend/src/theme.ts — keeps a consistent look with the original app.
const theme = createTheme({
  palette: {
    primary: { main: '#1a237e', light: '#534bae', dark: '#000051', contrastText: '#ffffff' },
    secondary: { main: '#00c853', light: '#5efc82', dark: '#009624', contrastText: '#000000' },
    background: { default: '#f5f5f5', paper: '#ffffff' },
    error: { main: '#d32f2f' },
    warning: { main: '#f57c00' },
    info: { main: '#0288d1' },
    success: { main: '#2e7d32' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 8, padding: '10px 20px' } } },
    MuiCard: { styleOverrides: { root: { boxShadow: '0 2px 12px rgba(0,0,0,0.08)' } } },
  },
});

// Duty type -> color, ported from the original pages. Used by chips and the calendar.
export const DUTY_COLORS: Record<string, string> = {
  'Flight Duty': '#1976d2',
  'Standby Airport': '#f57c00',
  'Standby Home': '#ff9800',
  'Office Duty': '#7b1fa2',
  Simulator: '#00838f',
  Training: '#2e7d32',
  Medical: '#c62828',
  Absence: '#b71c1c',
  Vacation: '#00c853',
  'Day Off': '#9e9e9e',
  Reserve: '#5c6bc0',
  Positioning: '#546e7a',
  Other: '#78909c',
};

export function dutyColor(dutyType: string): string {
  return DUTY_COLORS[dutyType] || '#9e9e9e';
}

export default theme;
