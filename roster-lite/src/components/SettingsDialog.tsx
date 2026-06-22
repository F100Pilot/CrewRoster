import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, InputAdornment, Link, Stack, TextField, Typography,
} from '@mui/material';
import { Close, Visibility, VisibilityOff, CheckCircle, Science, CalendarMonth, DeleteOutline, BugReport } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { API_KEY_PATTERN, getAeroDataBoxKey, setAeroDataBoxKey } from '../storage/settings';
import { fetchFlightInfo } from '../services/crewlinkApi';
import { operatedFlights } from '../domain/flightTime';
import { downloadIcs } from '../utils/icsExport';
import GoogleCalendarSync from './GoogleCalendarSync';
import { useRoster } from '../state/useRoster';

// In-app settings: lets the user paste their own AeroDataBox (RapidAPI) key so the day
// view can show aircraft registration, gate/terminal and status. The key is stored on
// this device only and forwarded to the proxy per request — never committed or shared.
export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { roster, clear, activeUser } = useRoster();
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Load the stored key whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setKey(getAeroDataBoxKey());
      setSaved(false);
      setShow(false);
      setTestResult(null);
      setConfirmClear(false);
    }
  }, [open]);

  // Wiping the roster is destructive, so the first tap arms a confirm and the second
  // actually clears and closes the dialog.
  function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return; }
    clear();
    setConfirmClear(false);
    onClose();
  }

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

  // Live end-to-end check: look up the most recent past flight and report exactly where
  // it fails (key not reaching the proxy, proxy/endpoint missing, API rejecting the key,
  // or simply no data) so we stop guessing.
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    // Save the current key first, so the test uses what's in the box.
    if (!invalid) setAeroDataBoxKey(trimmed);
    const today = new Date().toISOString().slice(0, 10);
    const sample = operatedFlights(roster?.duties ?? [])
      .filter((d) => d.flightNumber && d.date <= today)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!sample) {
      setTestResult({ ok: false, msg: 'Sem voos passados na escala para testar. Importa a escala primeiro.' });
      setTesting(false);
      return;
    }
    try {
      const r = await fetchFlightInfo(sample.flightNumber!, sample.date);
      const ref = `${sample.flightNumber} (${sample.date})`;
      if (!r.configured) {
        setTestResult({ ok: false, msg: `A chave não chegou ao proxy. Guarda a chave e confirma que o worker tem o endpoint /api/flightinfo (precisa de deploy do worker).` });
      } else if (r.error === 'http_404') {
        setTestResult({ ok: false, msg: `O worker respondeu 404 — não tem o endpoint /api/flightinfo. Faz deploy do worker atualizado.` });
      } else if (r.error?.startsWith('upstream_40')) {
        setTestResult({ ok: false, msg: `A AeroDataBox recusou a chave (${r.error.replace('upstream_', '')}). Confirma a chave e a subscrição no RapidAPI.` });
      } else if (r.error) {
        setTestResult({ ok: false, msg: `Erro do servidor (${r.error}) ao consultar ${ref}.` });
      } else if (r.flights.length === 0) {
        setTestResult({ ok: false, msg: `Ligação OK, mas a AeroDataBox não tem dados para ${ref}. Tenta um voo mais recente.` });
      } else {
        const reg = r.flights.find((f) => f.reg)?.reg;
        setTestResult(reg
          ? { ok: true, msg: `✅ Funciona: ${ref} → matrícula ${reg}.` }
          : { ok: false, msg: `${r.flights.length} voo(s) devolvido(s) para ${ref}, mas sem matrícula.` });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: `Falha de rede: ${e instanceof Error ? e.message : 'erro'}.` });
    }
    setTesting(false);
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

          {/* Diagnose end-to-end so a "no matrícula" symptom points at the real cause. */}
          <Box>
            <Button
              onClick={handleTest}
              disabled={testing || invalid || !trimmed}
              startIcon={testing ? <CircularProgress size={16} /> : <Science />}
              size="small"
              variant="outlined"
            >
              Testar ligação
            </Button>
          </Box>
          {testResult && (
            <Alert severity={testResult.ok ? 'success' : 'warning'}>{testResult.msg}</Alert>
          )}

          <Divider />

          {/* Roster actions, moved here from the list's overflow menu. */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Escala</Typography>
            <Stack spacing={1}>
              {roster && activeUser && (
                <GoogleCalendarSync
                  roster={roster}
                  userId={activeUser.id}
                  variant="outlined"
                  label="Sincronizar com Google Calendar"
                  fullWidth
                />
              )}
              <Button
                onClick={() => roster && downloadIcs(roster)}
                disabled={!roster}
                startIcon={<CalendarMonth />}
                size="small"
                variant="outlined"
                fullWidth
              >
                Exportar .ics
              </Button>
              <Button
                onClick={handleClear}
                disabled={!roster}
                startIcon={<DeleteOutline />}
                size="small"
                variant="outlined"
                color="error"
                fullWidth
              >
                {confirmClear ? 'Confirmar — apagar escala?' : 'Limpar escala'}
              </Button>
              {!roster && (
                <Typography variant="caption" color="text.secondary">
                  Sem escala importada.
                </Typography>
              )}
            </Stack>
          </Box>

          <Divider />

          {/* Diagnostics — moved out of the bottom bar into Settings. */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Diagnóstico</Typography>
            <Button
              onClick={() => { onClose(); navigate('/debug'); }}
              startIcon={<BugReport />}
              size="small"
              variant="outlined"
            >
              Abrir Debug
            </Button>
          </Box>
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
