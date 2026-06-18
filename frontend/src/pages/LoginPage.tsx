import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  FlightTakeoff,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [employeeNumber, setEmployeeNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!employeeNumber.trim() || !password.trim()) {
      setError('Please enter your employee number and password.');
      return;
    }

    setLoading(true);
    try {
      await login(employeeNumber, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #3949ab 100%)',
        p: 2,
      }}
    >
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <FlightTakeoff sx={{ fontSize: 64, color: '#fff', mb: 1 }} />
        <Typography variant="h4" fontWeight={700} color="white">
          CrewRoster
        </Typography>
        <Typography variant="subtitle1" color="rgba(255,255,255,0.7)">
          Portugália Airlines
        </Typography>
      </Box>

      <Card sx={{ width: '100%', maxWidth: 400 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom fontWeight={600}>
            Sign In
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Login with your employee number and password.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              label="Employee Number"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              fullWidth
              margin="normal"
              autoFocus
              disabled={loading}
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              margin="normal"
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{ mt: 3, py: 1.5 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Typography variant="body2" color="rgba(255,255,255,0.5)" sx={{ mt: 4 }}>
        CrewRoster v1.0 — For authorized crew members only
      </Typography>
    </Box>
  );
}
