import { alpha, createTheme, darken, lighten, type Theme } from '@mui/material/styles';

export type ColorMode = 'light' | 'dark';

// The 3D look (user-approved sketch, Nov 2026): surfaces lit from above and lifted off the page
// (a light top edge, a soft long shadow under), controls as keys with a darker edge under them that
// sink when pressed, fields and troughs pressed INTO the page. One set of tokens per colour mode,
// shared by the theme and by the components that draw their own surfaces (PassCard, PageHero…).
export interface Depth {
  surface: string; // a raised surface's fill
  card: string; // box-shadow of a card (level 2)
  low: string; // box-shadow of a row / tile (level 1)
  high: string; // box-shadow of a highlighted / active card (level 3)
  well: string; // fill of a sunken field or trough
  wellShadow: string; // its inner shadow
  keyLight: string; // fill of a light key (secondary button, chip)
  keyEdge: string; // the edge under a light key
}

export function depth(mode: ColorMode): Depth {
  return mode === 'light'
    ? {
      surface: 'linear-gradient(180deg, #FFFFFF 0%, #F2F5FA 100%)',
      card: 'inset 0 1px 0 #fff, inset 0 -2px 0 rgba(15,27,45,.05), 0 16px 28px -14px rgba(15,27,45,.38), 0 3px 6px rgba(15,27,45,.08)',
      low: 'inset 0 1px 0 #fff, 0 9px 14px -9px rgba(15,27,45,.4), 0 2px 4px rgba(15,27,45,.08)',
      high: 'inset 0 1px 0 #fff, 0 28px 40px -16px rgba(15,27,45,.5), 0 8px 14px rgba(15,27,45,.12)',
      well: 'linear-gradient(180deg, #E3E9F2, #F1F4F9)',
      wellShadow: 'inset 0 3px 6px rgba(15,27,45,.16), inset 0 -1px 0 #fff',
      keyLight: 'linear-gradient(180deg, #FFFFFF, #E6ECF5)',
      keyEdge: '#C3CEDF',
    }
    : {
      surface: 'linear-gradient(180deg, #1C2944 0%, #131D33 100%)',
      card: 'inset 0 1px 0 rgba(255,255,255,.08), 0 18px 30px -14px rgba(0,0,0,.75), 0 3px 6px rgba(0,0,0,.35)',
      low: 'inset 0 1px 0 rgba(255,255,255,.07), 0 10px 16px -10px rgba(0,0,0,.7), 0 2px 4px rgba(0,0,0,.3)',
      high: 'inset 0 1px 0 rgba(255,255,255,.1), 0 30px 44px -16px rgba(0,0,0,.85), 0 8px 14px rgba(0,0,0,.4)',
      well: 'linear-gradient(180deg, #0B1324, #111B30)',
      wellShadow: 'inset 0 3px 6px rgba(0,0,0,.55), inset 0 -1px 0 rgba(255,255,255,.05)',
      keyLight: 'linear-gradient(180deg, #24324F, #18233B)',
      keyEdge: '#0A1120',
    };
}

// A coloured key: lit gradient, darker edge under it, a coloured glow below.
export function keyStyle(main: string) {
  return {
    background: `linear-gradient(180deg, ${lighten(main, 0.22)} 0%, ${main} 100%)`,
    boxShadow: `0 4px 0 ${darken(main, 0.35)}, 0 12px 18px -8px ${alpha(main, 0.7)}, inset 0 1px 0 rgba(255,255,255,.4)`,
  };
}
export const keyPressed = (main: string) => ({
  transform: 'translateY(3px)',
  boxShadow: `0 1px 0 ${darken(main, 0.35)}, 0 4px 8px -4px ${alpha(main, 0.6)}, inset 0 2px 4px rgba(0,0,0,.25)`,
});

// Build the MUI theme for a given colour mode — the design language of the "Hoje" screen, in 3D
// (see Depth above), so every page reads as one app. The "Hoje" page layers its phase palette on top.
type Severity = 'info' | 'success' | 'warning' | 'error';
type KeyColor = 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
export function createAppTheme(mode: ColorMode): Theme {
  const light = mode === 'light';
  const navy = '#0A1222';
  const line = light ? '#E1E7F0' : '#24314D';
  const d = depth(mode);
  return createTheme({
    palette: {
      mode,
      primary: light
        ? { main: '#1F63B5', light: '#4E8BD6', dark: '#164E96', contrastText: '#ffffff' }
        : { main: '#7DB3F2', light: '#A9CDF7', dark: '#4E8BD6', contrastText: '#0A1222' },
      secondary: { main: '#F59E0B', light: '#FFC56B', dark: '#B45309', contrastText: '#1A1206' },
      background: light ? { default: '#E8EDF5', paper: '#FFFFFF' } : { default: navy, paper: '#131D33' },
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
      // The app bar: night blue, lit at the top, casting a shadow on the page.
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'inherit' },
        styleOverrides: {
          root: {
            backgroundColor: navy, backgroundImage: 'linear-gradient(180deg, #1C2D4E 0%, #0A1222 100%)', color: '#EAF0FA',
            borderBottom: 0, boxShadow: '0 10px 22px -8px rgba(4,10,24,.6), inset 0 -1px 0 rgba(255,255,255,.07)',
          },
        },
      },
      // Cards (level 2): no hairline, lit from above, lifted off the page.
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { borderRadius: 20, border: 0, '&.MuiPaper-outlined': { border: 0 }, background: d.surface, boxShadow: d.card } },
      },
      // Buttons as keys: contained = a coloured key with an edge that sinks when pressed; outlined = a
      // light key; text buttons stay flat.
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 14, padding: '8px 18px', transition: 'transform .08s, box-shadow .08s' },
          contained: ({ ownerState, theme }) => {
            const main = theme.palette[(ownerState.color as KeyColor) in theme.palette ? (ownerState.color as KeyColor) : 'primary']?.main ?? theme.palette.primary.main;
            return {
              ...keyStyle(main), color: theme.palette.getContrastText(main), marginBottom: 4,
              '&:hover': keyStyle(darken(main, 0.06)),
              '&:active': keyPressed(main),
              '&.Mui-disabled': { background: d.well, boxShadow: d.wellShadow },
            };
          },
          outlined: {
            border: 0, background: d.keyLight, marginBottom: 4,
            boxShadow: `0 4px 0 ${d.keyEdge}, 0 10px 16px -8px rgba(15,27,45,.35), inset 0 1px 0 ${light ? '#fff' : 'rgba(255,255,255,.08)'}`,
            '&:hover': { border: 0, background: d.keyLight },
            '&:active': { transform: 'translateY(3px)', boxShadow: `0 1px 0 ${d.keyEdge}, inset 0 2px 4px rgba(0,0,0,.15)` },
          },
        },
      },
      // Segmented choices: a trough pressed into the page; the chosen one a raised key.
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { background: d.well, boxShadow: d.wellShadow, borderRadius: 14, padding: 3, gap: 3 },
          grouped: { border: 0, margin: 0, borderRadius: '11px !important' },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 11, textTransform: 'none', fontWeight: 700, border: 0, color: theme.palette.text.secondary,
            '&.Mui-selected, &.Mui-selected:hover': { ...keyStyle(theme.palette.primary.main), color: theme.palette.primary.contrastText },
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600 },
          filled: ({ ownerState, theme }) => {
            if (ownerState.color && ownerState.color !== 'default') {
              const main = theme.palette[ownerState.color as KeyColor].main;
              return { background: `linear-gradient(180deg, ${lighten(main, 0.18)}, ${main})`, boxShadow: `0 2px 0 ${darken(main, 0.3)}, inset 0 1px 0 rgba(255,255,255,.35)` };
            }
            return { background: d.keyLight, boxShadow: `0 2px 0 ${d.keyEdge}, inset 0 1px 0 ${light ? '#fff' : 'rgba(255,255,255,.08)'}` };
          },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          thumb: { background: 'linear-gradient(180deg, #FFFFFF, #E3E9F2)', boxShadow: '0 2px 0 #B8C4D6, 0 4px 6px -2px rgba(0,0,0,.4)' },
          track: { opacity: 1, background: d.well, boxShadow: d.wellShadow },
          switchBase: ({ theme }) => ({ '&.Mui-checked + .MuiSwitch-track': { opacity: 1, background: `linear-gradient(180deg, ${theme.palette.primary.main}, ${darken(theme.palette.primary.main, 0.2)})` } }),
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 28, background: d.surface, boxShadow: '0 40px 60px -20px rgba(0,0,0,.6), 0 10px 20px rgba(0,0,0,.3)' },
        },
      },
      // Settings' tabs: a trough with the chosen tab as a raised key.
      MuiTabs: {
        styleOverrides: {
          root: { margin: '0 16px', padding: 4, borderRadius: 18, background: d.well, boxShadow: d.wellShadow, borderBottom: '0 !important' },
          indicator: { display: 'none' },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 14, color: theme.palette.text.secondary,
            '&.Mui-selected': { color: theme.palette.primary.main, background: d.keyLight, boxShadow: `0 3px 0 ${d.keyEdge}, 0 8px 12px -6px rgba(15,27,45,.4)` },
          }),
        },
      },
      // Fields pressed into the page.
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 14, background: d.well, boxShadow: d.wellShadow,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(theme.palette.primary.main, 0.35) },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.primary.main },
          }),
        },
      },
      // Progress as a tube: a sunken track, a glossy fill.
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 12, borderRadius: 6, background: d.well, boxShadow: d.wellShadow },
          bar: { borderRadius: 6, boxShadow: 'inset 0 2px 0 rgba(255,255,255,.5), inset 0 -3px 0 rgba(0,0,0,.18)' },
        },
      },
      // Notices: a soft tint of their colour with a hairline border, text in the normal ink.
      MuiAlert: {
        styleOverrides: {
          root: ({ ownerState, theme }) => {
            const sev = (ownerState.severity ?? 'info') as Severity;
            const c = theme.palette[sev].main;
            if (ownerState.variant && ownerState.variant !== 'standard') return { borderRadius: 14 };
            return {
              borderRadius: 16,
              border: `1px solid ${alpha(c, 0.35)}`,
              backgroundColor: alpha(c, light ? 0.07 : 0.14),
              boxShadow: `inset 0 1px 0 ${light ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.06)'}, 0 10px 16px -12px ${alpha(c, 0.6)}`,
              color: theme.palette.text.primary,
              '& .MuiAlert-icon': { color: c },
            };
          },
        },
      },
      // The bottom bar is a floating dock (Layout); the chosen tab's icon is a raised key.
      MuiBottomNavigation: { styleOverrides: { root: { backgroundColor: 'transparent', height: 66 } } },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: ({ theme }) => ({
            '& .MuiSvgIcon-root': { padding: '5px 9px', borderRadius: 11, boxSizing: 'content-box', transition: 'transform .15s' },
            '&.Mui-selected': { fontWeight: 700 },
            '&.Mui-selected .MuiSvgIcon-root': {
              ...keyStyle(light ? '#2F6BE0' : theme.palette.primary.main), color: light ? '#fff' : theme.palette.primary.contrastText,
              transform: 'translateY(-4px)',
            },
          }),
          label: { fontSize: '0.68rem', '&.Mui-selected': { fontSize: '0.7rem' } },
        },
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
