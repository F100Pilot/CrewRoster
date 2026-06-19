import { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { Person } from '@mui/icons-material';
import { useRoster } from '../state/useRoster';

export default function WelcomePage() {
  const { createUser } = useRoster();
  const [name, setName] = useState('');
  const [crewCode, setCrewCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleStart() {
    if (!name.trim()) return;
    setBusy(true);
    await createUser(name, crewCode);
    setBusy(false);
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      px={3}
      sx={{ bgcolor: 'background.default' }}
    >
      <Box
        component="img"
        src="/CrewRoster/icon.svg"
        alt="CrewRoster"
        sx={{ width: 80, height: 80, mb: 3, borderRadius: 3 }}
      />
      <Typography variant="h5" fontWeight={700} mb={0.5} textAlign="center">
        CrewRoster Lite
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={4} textAlign="center">
        Bem-vindo! Como te chamas?
      </Typography>

      <Stack spacing={2} width="100%" maxWidth={360}>
        <TextField
          label="O teu nome"
          placeholder="Ex: João Silva"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          autoFocus
          fullWidth
          size="small"
        />
        <TextField
          label="Código de tripulante (opcional)"
          placeholder="Ex: FPT001"
          value={crewCode}
          onChange={(e) => setCrewCode(e.target.value)}
          fullWidth
          size="small"
        />
        <Button
          variant="contained"
          size="large"
          startIcon={<Person />}
          onClick={handleStart}
          disabled={!name.trim() || busy}
        >
          Começar
        </Button>
      </Stack>
    </Box>
  );
}
