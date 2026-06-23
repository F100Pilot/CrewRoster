import { createTheme, type Theme } from '@mui/material/styles';

export type ColorMode = 'light' | 'dark';

// Build the MUI theme for a given colour mode. Keeps the deep-indigo brand in light mode
// and a lighter indigo in dark mode (legible on dark surfaces), with proper dark surfaces.
export function createAppTheme(mode: ColorMode): Theme {
  const light = mode === 'light';
  return createTheme({
    palette: {
      mode,
      primary: light
        ? { main: '#1a237e', light: '#534bae', dark: '#000051', contrastText: '#ffffff' }
        : { main: '#7986cb', light: '#aab6fe', dark: '#49599a', contrastText: '#0b0b0b' },
      secondary: { main: '#00c853', light: '#5efc82', dark: '#009624', contrastText: '#000000' },
      background: light
        ? { default: '#f5f5f5', paper: '#ffffff' }
        : { default: '#121212', paper: '#1e1e1e' },
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
      MuiCard: {
        styleOverrides: {
          root: { boxShadow: light ? '0 2px 12px rgba(0,0,0,0.08)' : '0 2px 12px rgba(0,0,0,0.5)' },
        },
      },
    },
  });
}

const theme = createAppTheme('light');

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
