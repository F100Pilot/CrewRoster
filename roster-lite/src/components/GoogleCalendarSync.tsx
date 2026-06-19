import { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle,
  Divider, IconButton, Link, LinearProgress, Stack, TextField, Typography,
} from '@mui/material';
import { Close, Google, OpenInNew } from '@mui/icons-material';
import {
  getClientId, setClientId, clearClientId,
  syncToGoogleCalendar, type SyncProgressFn,
} from '../utils/googleCalendar';
import type { Roster } from '../domain/types';

type Phase = 'idle' | 'setup' | 'syncing' | 'done' | 'error';

interface Props {
  roster: Roster;
}

export default function GoogleCalendarSync({ roster }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [clientIdInput, setClientIdInput] = useState(getClientId() ?? '');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const hasClientId = !!getClientId();

  function openDialog() {
    setPhase(hasClientId ? 'idle' : 'setup');
    setMessage('');
    setErrorMsg('');
    setProgress(null);
    setOpen(true);
  }

  function close() {
    if (phase === 'syncing') return; // block accidental close
    setOpen(false);
    setTimeout(() => setPhase('idle'), 300); // reset after animation
  }

  async function handleSync() {
    const cid = hasClientId ? getClientId()! : clientIdInput.trim();
    if (!cid) return;

    if (!hasClientId) setClientId(cid);

    setPhase('syncing');
    setProgress(null);
    setErrorMsg('');

    const onProgress: SyncProgressFn = (msg, done, total) => {
      setMessage(msg);
      setProgress(done != null && total != null ? { done, total } : null);
    };

    try {
      await syncToGoogleCalendar(roster, cid, onProgress);
      setPhase('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  function handleDisconnect() {
    clearClientId();
    setClientIdInput('');
    setPhase('setup');
    setErrorMsg('');
  }

  return (
    <>
      <Button size="small" startIcon={<Google />} onClick={openDialog}>
        Google Calendar
      </Button>

      <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Google Calendar
          <IconButton size="small" onClick={close} disabled={phase === 'syncing'}>
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            {/* ── Setup: client ID not configured ── */}
            {(phase === 'setup' || (!hasClientId && phase === 'idle')) && (
              <>
                <Typography variant="body2">
                  Esta funcionalidade sincroniza a tua escala com um calendário chamado{' '}
                  <strong>"CrewRoster Lite"</strong> na tua conta Google.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Precisas de criar credenciais OAuth gratuitas no Google Cloud. Segue os passos:
                </Typography>
                <Box component="ol" sx={{ pl: 2, m: 0, '& li': { mb: 0.5 } }}>
                  <Typography component="li" variant="body2">
                    Abre{' '}
                    <Link href="https://console.cloud.google.com/" target="_blank" rel="noopener">
                      console.cloud.google.com
                    </Link>{' '}
                    e cria um projeto (ex: "CrewRoster").
                  </Typography>
                  <Typography component="li" variant="body2">
                    Ativa a <strong>Google Calendar API</strong> (Biblioteca → pesquisa "Calendar").
                  </Typography>
                  <Typography component="li" variant="body2">
                    Cria um <strong>Ecrã de consentimento OAuth</strong> → Externo → adiciona o teu e-mail como utilizador de teste.
                  </Typography>
                  <Typography component="li" variant="body2">
                    Cria credenciais: <strong>ID de cliente OAuth → Aplicação Web</strong>.
                    Em "Origens JavaScript autorizadas" adiciona:{' '}
                    <code style={{ fontSize: '0.75rem', background: '#f5f5f5', padding: '1px 4px' }}>
                      {window.location.origin}
                    </code>
                  </Typography>
                  <Typography component="li" variant="body2">
                    Copia o <strong>ID de cliente</strong> e cola abaixo.
                  </Typography>
                </Box>
                <Divider />
                <TextField
                  label="ID de cliente Google OAuth"
                  placeholder="XXXXXXXXXX-xxxx.apps.googleusercontent.com"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  size="small"
                  fullWidth
                  helperText="Guardado localmente no teu dispositivo; nunca enviado a nenhum servidor."
                />
                <Button
                  variant="contained"
                  startIcon={<Google />}
                  onClick={handleSync}
                  disabled={!clientIdInput.trim()}
                >
                  Autorizar e sincronizar
                </Button>
              </>
            )}

            {/* ── Idle: client ID already stored ── */}
            {phase === 'idle' && hasClientId && (
              <>
                <Typography variant="body2">
                  Pronto para sincronizar <strong>{roster.duties.length} entradas</strong> da escala{' '}
                  <em>{roster.fileName}</em> para o calendário "CrewRoster Lite" no Google Calendar.
                </Typography>
                <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                  Todos os eventos existentes no calendário "CrewRoster Lite" serão substituídos.
                </Alert>
                <Box display="flex" gap={1} flexWrap="wrap">
                  <Button variant="contained" startIcon={<Google />} onClick={handleSync}>
                    Sincronizar agora
                  </Button>
                  <Button size="small" color="inherit" onClick={handleDisconnect}>
                    Desligar conta
                  </Button>
                </Box>
              </>
            )}

            {/* ── In progress ── */}
            {phase === 'syncing' && (
              <Box>
                <Box display="flex" alignItems="center" gap={1.5} mb={1.5}>
                  <CircularProgress size={20} />
                  <Typography variant="body2">{message}</Typography>
                </Box>
                {progress && (
                  <>
                    <LinearProgress
                      variant="determinate"
                      value={(progress.done / progress.total) * 100}
                      sx={{ borderRadius: 1, mb: 0.5 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {progress.done} / {progress.total}
                    </Typography>
                  </>
                )}
              </Box>
            )}

            {/* ── Done ── */}
            {phase === 'done' && (
              <>
                <Alert severity="success">
                  Escala sincronizada com sucesso! O calendário "CrewRoster Lite" foi atualizado.
                </Alert>
                <Button
                  variant="outlined"
                  endIcon={<OpenInNew />}
                  href="https://calendar.google.com/calendar/r"
                  target="_blank"
                  rel="noopener"
                >
                  Abrir Google Calendar
                </Button>
              </>
            )}

            {/* ── Error ── */}
            {phase === 'error' && (
              <>
                <Alert severity="error">{errorMsg}</Alert>
                <Button variant="outlined" onClick={handleSync}>
                  Tentar novamente
                </Button>
              </>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
