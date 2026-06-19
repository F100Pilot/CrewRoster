import { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle,
  Divider, IconButton, Link, LinearProgress, Stack, TextField, Typography,
} from '@mui/material';
import { Close, Google, OpenInNew } from '@mui/icons-material';
import {
  getClientId, setClientId, revokeAccess,
  syncToGoogleCalendar, type SyncProgressFn,
} from '../utils/googleCalendar';
import type { Roster } from '../domain/types';

type Phase = 'idle' | 'setup' | 'syncing' | 'done' | 'error';

interface Props {
  roster: Roster;
  userId: string;
  variant?: 'text' | 'outlined' | 'contained';
  label?: string;
}

export default function GoogleCalendarSync({ roster, userId, variant = 'text', label = 'Calendar' }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [clientIdInput, setClientIdInput] = useState('');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  function openDialog() {
    const stored = getClientId(userId);
    setClientIdInput(stored ?? '');
    setPhase(stored ? 'idle' : 'setup');
    setMessage('');
    setErrorMsg('');
    setProgress(null);
    setOpen(true);
  }

  function close() {
    if (phase === 'syncing') return;
    setOpen(false);
    setTimeout(() => setPhase('idle'), 300);
  }

  async function handleSync() {
    const storedId = getClientId(userId);
    const cid = storedId ?? clientIdInput.trim();
    if (!cid) return;

    if (!storedId) setClientId(userId, cid);

    setPhase('syncing');
    setProgress(null);
    setErrorMsg('');

    const onProgress: SyncProgressFn = (msg, done, total) => {
      setMessage(msg);
      setProgress(done != null && total != null ? { done, total } : null);
    };

    try {
      await syncToGoogleCalendar(roster, userId, cid, onProgress);
      setPhase('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }

  function handleDisconnect() {
    revokeAccess(userId);
    setClientIdInput('');
    setPhase('setup');
    setErrorMsg('');
  }

  const hasClientId = !!getClientId(userId);

  return (
    <>
      <Button size="small" variant={variant} startIcon={<Google />} onClick={openDialog}>
        {label}
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
            {/* ── Setup ── */}
            {(phase === 'setup' || (!hasClientId && phase === 'idle')) && (
              <>
                <Typography variant="body2">
                  Sincroniza a tua escala com um calendário chamado{' '}
                  <strong>"CrewRoster Lite"</strong> na tua conta Google.
                  As credenciais ficam guardadas <strong>neste dispositivo</strong>, separadas por utilizador.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Segue os passos para criar credenciais OAuth gratuitas:
                </Typography>
                <Box component="ol" sx={{ pl: 2, m: 0, '& li': { mb: 0.5 } }}>
                  <Typography component="li" variant="body2">
                    Abre{' '}
                    <Link href="https://console.cloud.google.com/" target="_blank" rel="noopener">
                      console.cloud.google.com
                    </Link>{' '}
                    → cria um projeto (ex: "CrewRoster").
                  </Typography>
                  <Typography component="li" variant="body2">
                    <strong>Biblioteca</strong> → ativa a <strong>Google Calendar API</strong>.
                  </Typography>
                  <Typography component="li" variant="body2">
                    <strong>Ecrã de consentimento OAuth</strong> → Externo → adiciona o teu e-mail como utilizador de teste.
                  </Typography>
                  <Typography component="li" variant="body2">
                    <strong>Credenciais</strong> → ID de cliente OAuth → Aplicação Web.
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
                  helperText="Guardado localmente neste dispositivo; nunca enviado a servidores."
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

            {/* ── Idle ── */}
            {phase === 'idle' && hasClientId && (
              <>
                <Typography variant="body2">
                  Pronto para sincronizar <strong>{roster.duties.length} entradas</strong> da escala{' '}
                  <em>{roster.fileName}</em>.
                </Typography>
                <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                  Os eventos existentes no calendário "CrewRoster Lite" serão substituídos.
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
                  Escala sincronizada! O calendário "CrewRoster Lite" foi atualizado.
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
