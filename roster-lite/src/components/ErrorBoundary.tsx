import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ErrorOutline, Refresh } from '@mui/icons-material';

interface Props { children: ReactNode }
interface State { error: Error | null }

// Catches render-time errors anywhere below it so a single bad component (e.g. a corrupt
// roster reaching a page) shows a recoverable message instead of a blank white screen —
// which is especially important for an installed PWA where the user can't just "go back".
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a console trail for diagnostics; no external reporting (the app is offline-first).
    console.error('Erro na aplicação:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Box
        sx={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          p: 3, bgcolor: 'background.default',
        }}
      >
        <Stack spacing={2} alignItems="center" sx={{ maxWidth: 420, textAlign: 'center' }}>
          <ErrorOutline color="error" sx={{ fontSize: 48 }} />
          <Typography variant="h6">Algo correu mal</Typography>
          <Typography variant="body2" color="text.secondary">
            A aplicação encontrou um erro inesperado. Os teus dados estão guardados no
            dispositivo — recarrega para continuar.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
            {this.state.error.message}
          </Typography>
          <Button variant="contained" startIcon={<Refresh />} onClick={() => window.location.reload()}>
            Recarregar
          </Button>
        </Stack>
      </Box>
    );
  }
}
