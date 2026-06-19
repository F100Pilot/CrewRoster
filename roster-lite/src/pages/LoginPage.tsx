import { useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Login, CloudUpload } from '@mui/icons-material';
import { login, fetchRoster } from '../services/crewlinkApi';
import { useRoster } from '../state/useRoster';

interface LoginPageProps {
  /** Switch to the manual upload view. */
  onSwitchToUpload: () => void;
}

export default function LoginPage({ onSwitchToUpload }: LoginPageProps) {
  const { importFile } = useRoster();

  const [crewCode, setCrewCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!crewCode || !password) return;

    setLoading(true);
    setError(null);
    setStatus('A autenticar...');

    try {
      // Step 1: Login
      const sessionToken = await login(crewCode, password);
      setStatus('Sessão obtida. A descarregar escala...');

      // Step 2: Fetch roster PDF
      const pdfBuffer = await fetchRoster({ sessionToken });
      setStatus('PDF recebido. A processar...');

      // Step 3: Feed the PDF through the existing parser pipeline
      const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const pdfFile = new File([pdfBlob], 'crewlink-roster.pdf', { type: 'application/pdf' });
      await importFile(pdfFile);

      // importFile will set the roster in context, which triggers navigation
      // back to the roster list via the parent component.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={3} alignItems="center">
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom align="center">
            CrewLink Login
          </Typography>
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
            Inicia sessão no CrewLink para importar a tua escala automaticamente.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Código tripulante"
                value={crewCode}
                onChange={(e) => setCrewCode(e.target.value)}
                disabled={loading}
                autoComplete="username"
                autoFocus
                fullWidth
                required
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
                fullWidth
                required
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loading || !crewCode || !password}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Login />}
                fullWidth
              >
                {loading ? status || 'A processar...' : 'Entrar'}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Divider flexItem>
        <Typography variant="caption" color="text.secondary">
          ou
        </Typography>
      </Divider>

      <Button
        variant="outlined"
        startIcon={<CloudUpload />}
        onClick={onSwitchToUpload}
        disabled={loading}
      >
        Importar ficheiro manualmente
      </Button>
    </Stack>
  );
}
