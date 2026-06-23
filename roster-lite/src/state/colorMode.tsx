import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { createAppTheme, type ColorMode } from '../theme';

const STORAGE_KEY = 'crewroster.colorMode';

interface ColorModeState {
  mode: ColorMode;
  toggle: () => void;
  setMode: (m: ColorMode) => void;
}

const ColorModeContext = createContext<ColorModeState | null>(null);

// Reads the saved preference, else follows the OS setting on first run.
function initialMode(): ColorMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(initialMode);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, mode); }, [mode]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const ctx = useMemo<ColorModeState>(
    () => ({ mode, setMode, toggle: () => setMode((m) => (m === 'light' ? 'dark' : 'light')) }),
    [mode],
  );

  return (
    <ColorModeContext.Provider value={ctx}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeState {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode must be used within <ColorModeProvider>');
  return ctx;
}
