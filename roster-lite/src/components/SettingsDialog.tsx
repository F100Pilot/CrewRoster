import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  InputAdornment, Link, Stack, TextField, Typography,
} from '@mui/material';
import { Close, Visibility, VisibilityOff, CheckCircle } from '@mui/icons-material';
import { API_KEY_PATTERN, getAeroDataBoxKey, setAeroDataBoxKey } from '../storage/settings';

// In-app settings: lets the user paste their own AeroDataBox (RapidAPI) key so the day
// view can show aircraft registration, gate/terminal and status. The key is stored on
// this device only and forwarded to the proxy per request — never committed or shared.
export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load the stored key whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setKey(getAeroDataBoxKey());
      setSaved(false);
      setShow(false);
    }
  }, [open]);

  const trimmed = key.trim();
  const invalid = trimmed !== '' && !API_KEY_PATTERN.test(trimmed);

  function handleSave() {
    if (invalid) return;
    setAeroDataBoxKey(trimmed);
    setSaved(true);
  }

  function handleRemove() {
    setAeroDataBoxKey('');
    setKey('');
    setSaved(true);
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box flexGrow={1}>Definições</Box>
        <IconButton onClick={onClose} size="small"><Close fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>Dados de voo (AeroDataBox)</Typography>
            <Typography variant="body2" color="text.secondary">
              Mostra matrícula da aeronave, terminal/porta e estado do voo no detalhe do
              dia. Precisa da tua chave da API <strong>AeroDataBox</strong> (via{' '}
              <Link href="https://rapidapi.com/aedbx-aedbx/api/aerodatabox" target="_blank" rel="noopener">
                RapidAPI
              </Link>, tem plano gratuito).
            </Typography>
          </Box>

          {saved && (
            <Alert severity="success" icon={<CheckCircle fontSize="inherit" />}>
              Definições guardadas neste dispositivo.
            </Alert>
          )}

          <TextField
            label="Chave AeroDataBox"
            value={key}
            onChange={(e) => { setKey(e.target.value); setSaved(false); }}
            type={show ? 'text' : 'password'}
            placeholder="A tua X-RapidAPI-Key"
            size="small"
            fullWidth
            error={invalid}
            helperText={invalid ? 'Chave inválida (só letras, números, . _ -).' : 'Fica só neste dispositivo.'}
            autoComplete="off"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShow((s) => !s)} edge="end" size="small">
                    {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleRemove} color="inherit" disabled={!getAeroDataBoxKey()}>
          Remover
        </Button>
        <Box flexGrow={1} />
        <Button onClick={onClose} color="inherit">Fechar</Button>
        <Button onClick={handleSave} variant="contained" disabled={invalid}>Guardar</Button>
      </DialogActions>
    </Dialog>
  );
}
