import { alpha, createTheme, type Theme } from '@mui/material/styles';

export type ColorMode = 'light' | 'dark';

// Build the MUI theme for a given colour mode — the same design language as the "Hoje" screen
// (night-blue app bar, flat cards with a hairline border instead of shadows, soft tinted notices,
// rounded inputs), so every page reads as one app. The "Hoje" page layers its phase palette on top.
type Severity = 'info' | 'success' | 'warning' | 'error';
export function createAppTheme(mode: ColorMode): Theme {
  const light = mode === 'light';
  const navy = '#0A1222';
  const line = light ? '#E1E7F0' : '#24314D';
  return createTheme({
    palette: {
      mode,
      primary: light
        ? { main: '#1F63B5', light: '#4E8BD6', dark: '#164E96', contrastText: '#ffffff' }
        : { main: '#7DB3F2', light: '#A9CDF7', dark: '#4E8BD6', contrastText: '#0A1222' },
      secondary: { main: '#F59E0B', light: '#FFC56B', dark: '#B45309', contrastText: '#1A1206' },
      background: light ? { default: '#EEF3FA', paper: '#FFFFFF' } : { default: navy, paper: '#131D33' },
      text: light ? { primary: '#101828', secondary: '#475467' } : { primary: '#EAF0FA', secondary: '#A6B5CE' },
      divider: line,
      error: { main: light ? '#C62828' : '#F87171' },
      warning: { main: light ? '#C2410C' : '#FBBF24' },
      info: { main: light ? '#0369A1' : '#60A5FA' },
      success: { main: light ? '#15803D' : '#4ADE80' },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h4: { fontWeight: 800, letterSpacing: '-0.02em' },
      h5: { fontWeight: 800, letterSpacing: '-0.01em' },
      h6: { fontWeight: 800, letterSpacing: '-0.01em' },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 700 },
      overline: { fontWeight: 700, letterSpacing: '0.08em' },
      button: { textTransform: 'none', fontWeight: 700 },
    },
    shape: { borderRadius: 12 },
    components: {
      // iPhone: the app is drawn edge to edge (viewport-fit=cover, status bar "black-translucent"),
      // so the bars keep clear of the notch / Dynamic Island and the home indicator with the safe
      // areas. Kept in variables so a test can set them (desktop browsers report 0).
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            '--sat': 'env(safe-area-inset-top, 0px)', '--sab': 'env(safe-area-inset-bottom, 0px)',
            '--sal': 'env(safe-area-inset-left, 0px)', '--sar': 'env(safe-area-inset-right, 0px)',
          },
          // No rubber-band bounce dragging the whole app (and the bars) on iOS.
          body: { overscrollBehaviorY: 'none' },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'inherit' },
        styleOverrides: { root: { backgroundColor: navy, color: '#EAF0FA', borderBottom: `1px solid ${light ? navy : line}` } },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { borderRadius: 16, border: `1px solid ${line}`, boxShadow: 'none' } },
      },
      MuiButton: { styleOverrides: { root: { borderRadius: 10, padding: '8px 18px' } } },
      MuiToggleButton: { styleOverrides: { root: { borderRadius: 10, textTransform: 'none', fontWeight: 600 } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 20 } } },
      MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 12 } } },
      // Notices: a soft tint of their colour with a hairline border, text in the normal ink.
      MuiAlert: {
        styleOverrides: {
          root: ({ ownerState, theme }) => {
            const sev = (ownerState.severity ?? 'info') as Severity;
            const c = theme.palette[sev].main;
            if (ownerState.variant && ownerState.variant !== 'standard') return { borderRadius: 14 };
            return {
              borderRadius: 14,
              border: `1px solid ${alpha(c, 0.35)}`,
              backgroundColor: alpha(c, light ? 0.07 : 0.14),
              color: theme.palette.text.primary,
              '& .MuiAlert-icon': { color: c },
            };
          },
        },
      },
      MuiBottomNavigation: { styleOverrides: { root: { backgroundColor: light ? '#FFFFFF' : '#0E172B', height: 60 } } },
      MuiBottomNavigationAction: {
        styleOverrides: { root: { '&.Mui-selected': { fontWeight: 700 } }, label: { fontSize: '0.72rem', '&.Mui-selected': { fontSize: '0.74rem' } } },
      },
    },
  });
}

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
