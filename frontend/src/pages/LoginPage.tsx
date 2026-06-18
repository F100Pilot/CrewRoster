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
  Tabs,
  Tab,
  MenuItem,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  FlightTakeoff,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const BASES = ['LIS', 'OPO', 'FAO', 'PDL', 'FNC', 'TER'];
const ROLES = ['Captain', 'First Officer', 'Senior Cabin Crew', 'Cabin Crew'];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [tab, setTab] = useState(0);
  const [crewCode, setCrewCode] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [base, setBase] = useState('LIS');
  const [role, setRole] = useState('First Officer');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isLogin = tab === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!crewCode.trim() || !password.trim()) {
      setError('Please enter your CREW CODE and password.');
      return;
    }

    if (!isLogin && !fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await login(crewCode, password);
      } else {
        await register(crewCode, password, fullName, base, role, email || undefined);
      }
      navigate('/');
    } catch (err: any) {
      const msg = err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found'
        ? 'Invalid CREW CODE or password.'
        : err.code === 'auth/email-already-in-use'
        ? 'This CREW CODE is already registered.'
        : err.code === 'auth/weak-password'
        ? 'Password must be at least 6 characters.'
        : err.message || 'Authentication failed. Please try again.';
      setError(msg);
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

      <Card sx={{ width: '100%', maxWidth: 440 }}>
        <Tabs value={tab} onChange={(_, v) => { setTab(v); setError(''); }} variant="fullWidth">
          <Tab label="Sign In" />
          <Tab label="Register" />
        </Tabs>

        <CardContent sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {isLogin
              ? 'Login with your CREW CODE and password.'
              : 'Create your account with your crew details.'}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              label="CREW CODE"
              value={crewCode}
              onChange={(e) => setCrewCode(e.target.value)}
              fullWidth
              margin="normal"
              autoFocus
              disabled={loading}
              helperText={isLogin ? '' : 'Your airline crew code (e.g. PT12345)'}
            />

            {!isLogin && (
              <TextField
                label="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                fullWidth
                margin="normal"
                disabled={loading}
              />
            )}

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
                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {!isLogin && (
              <>
                <TextField
                  label="Email (optional)"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  fullWidth
                  margin="normal"
                  disabled={loading}
                />
                <TextField
                  select
                  label="Base"
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                  fullWidth
                  margin="normal"
                  disabled={loading}
                >
                  {BASES.map((b) => (
                    <MenuItem key={b} value={b}>{b}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  fullWidth
                  margin="normal"
                  disabled={loading}
                >
                  {ROLES.map((r) => (
                    <MenuItem key={r} value={r}>{r}</MenuItem>
                  ))}
                </TextField>
              </>
            )}

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{ mt: 3, py: 1.5 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : isLogin ? 'Sign In' : 'Register'}
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
