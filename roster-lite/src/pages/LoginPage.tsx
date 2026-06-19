import { useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Login } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/crewlinkApi';
import { useRoster } from '../state/useRoster';

export default function LoginPage() {
  const { setSessionToken } = useRoster();
  const navigate = useNavigate();

  const [crewCode, setCrewCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!crewCode || !password) return;

    setLoading(true);
    setError(null);

    try {
      const token = await login(crewCode, password);
      setSessionToken(token);
      navigate('/import');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.');
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
            Inicia sessão para descarregar a tua escala do CrewLink.
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
                {loading ? 'A autenticar…' : 'Entrar'}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
