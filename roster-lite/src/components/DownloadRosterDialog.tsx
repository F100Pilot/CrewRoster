import { useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, Link, Stack, TextField, Typography,
} from '@mui/material';
import { CloudDownload, Close, Login, CheckCircle, NotificationsActive } from '@mui/icons-material';
import { format } from 'date-fns';
import { login, fetchRoster, SessionExpiredError } from '../services/crewlinkApi';
import { useRoster } from '../state/useRoster';
import { savePdf } from '../storage/rosterStore';
import { addNotification } from '../storage/notifications';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function toCrewLinkDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}${MONTHS[parseInt(m) - 1]}${y}`;
}

// One-stop modal to pull the roster straight from CrewLink while staying on the main
// page: authenticate if needed, pick a date range, download → parse → the roster view
// updates in place (and the diff banner fires if anything changed).
export default function DownloadRosterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sessionToken, setSessionToken, importFile, importing, activeUser } = useRoster();

  const [crewCode, setCrewCode] = useState(activeUser?.crewCode ?? '');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [beginDate, setBeginDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Pending CrewLink notification the user must read and confirm before the PDF
  // can be generated. While set, the dialog shows the notification phase.
  const [pendingNotification, setPendingNotification] = useState<string | null>(null);

  function handleClose() {
    if (downloading || authLoading) return;
    setDone(false);
    setError(null);
    setStatus('');
    setPassword('');
    setPendingNotification(null);
    onClose();
  }

  async function handleLogin() {
    if (!crewCode || !password) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const token = await login(crewCode, password);
      setSessionToken(token);
      setPassword(''); // don't keep the password in memory longer than needed
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Erro de autenticação.');
    } finally {
      setAuthLoading(false);
    }
  }

  // Persist + parse the downloaded PDF. Shared by the normal and post-confirmation
  // paths. `notificationText`, when given, is recorded in the top banner.
  async function processPdf(buffer: ArrayBuffer, notificationText?: string) {
    setStatus('PDF recebido. A processar…');
    const blob = new Blob([buffer], { type: 'application/pdf' });
    const id = crypto.randomUUID();
    const fileName = `escala-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`;
    await savePdf({
      id,
      userId: activeUser?.id,
      fileName,
      blob,
      downloadedAt: new Date().toISOString(),
      beginDate: beginDate || null,
      endDate: endDate || null,
    });
    await importFile(new File([blob], fileName, { type: 'application/pdf' }));
    if (notificationText && activeUser) addNotification(activeUser.id, notificationText);
    setStatus('');
    setPendingNotification(null);
    setDone(true);
  }

  // confirmNotification: when true, the worker acknowledges the pending CrewLink
  // notification before generating the PDF (the user pressed "Confirmar").
  async function runDownload(confirmNotification: boolean) {
    if (!sessionToken || !activeUser) return; // never save a PDF without a concrete owner
    setDownloading(true);
    setError(null);
    setDone(false);
    setStatus(confirmNotification ? 'A confirmar notificação…' : 'A descarregar do CrewLink…');
    try {
      const options = {
        sessionToken,
        ...(beginDate ? { beginDate: toCrewLinkDate(beginDate) } : {}),
        ...(endDate ? { endDate: toCrewLinkDate(endDate) } : {}),
        ...(confirmNotification ? { confirmNotification: true } : {}),
      };

      const result = await fetchRoster(options);
      if (result.type === 'notification') {
        // CrewLink blocked the period with an unread notification: show it and let
        // the user decide. Nothing is confirmed until they press "Confirmar".
        setPendingNotification(result.text || '(Sem texto na notificação.)');
        setStatus('');
        return;
      }
      // Keep the session alive if NetLine rotated the JSESSIONID during the download.
      if (result.sessionToken && result.sessionToken !== sessionToken) setSessionToken(result.sessionToken);
      // result.type === 'pdf' — record the notification text in the banner if this
      // download was the confirmation step.
      await processPdf(result.buffer, confirmNotification ? pendingNotification ?? undefined : undefined);
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        setSessionToken(null); // volta ao ecrã de login automaticamente
        setPendingNotification(null);
      } else {
        setError(e instanceof Error ? e.message : 'Erro ao obter a escala.');
      }
      setStatus('');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <CloudDownload color="primary" />
        <Box flexGrow={1}>Descarregar escala</Box>
        <IconButton onClick={handleClose} size="small" disabled={downloading || authLoading}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {done ? (
          <Stack spacing={2} alignItems="center" py={2}>
            <CheckCircle color="success" sx={{ fontSize: 48 }} />
            <Typography variant="body2" textAlign="center">
              Escala atualizada. As alterações aparecem na lista.
            </Typography>
            <Button variant="contained" onClick={handleClose}>Ver escala</Button>
          </Stack>
        ) : pendingNotification !== null ? (
          // ── Notification phase ───────────────────────────────────────────────
          <Stack spacing={2} pt={0.5}>
            <Alert severity="warning" icon={<NotificationsActive />}>
              O CrewLink tem uma notificação por ler para este período. Lê-a abaixo. Só
              depois de a confirmares é que a escala é descarregada.
            </Alert>
            {error && <Alert severity="error">{error}</Alert>}
            <Box
              sx={{
                maxHeight: 280, overflowY: 'auto', p: 1.5, borderRadius: 1,
                bgcolor: 'action.hover', whiteSpace: 'pre-wrap',
                fontSize: 13, fontFamily: 'inherit',
              }}
            >
              {pendingNotification}
            </Box>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={() => runDownload(true)}
                disabled={downloading}
                startIcon={downloading ? <CircularProgress size={18} color="inherit" /> : <CheckCircle />}
              >
                {downloading ? 'A confirmar…' : 'Confirmar'}
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                fullWidth
                onClick={handleClose}
                disabled={downloading}
              >
                Não confirmar
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Se não confirmares, nada é alterado — é como se tivesses saído.
            </Typography>
          </Stack>
        ) : !sessionToken ? (
          // ── Login phase ──────────────────────────────────────────────────────
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              Inicia sessão no CrewLink para descarregar a tua escala.
            </Typography>
            {authError && <Alert severity="error">{authError}</Alert>}
            <TextField
              label="Código tripulante"
              value={crewCode}
              onChange={(e) => setCrewCode(e.target.value)}
              disabled={authLoading}
              autoComplete="username"
              size="small"
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              disabled={authLoading}
              autoComplete="current-password"
              size="small"
              fullWidth
            />
            <Button
              variant="contained"
              onClick={handleLogin}
              disabled={authLoading || !crewCode || !password}
              startIcon={authLoading ? <CircularProgress size={18} color="inherit" /> : <Login />}
            >
              {authLoading ? 'A autenticar…' : 'Entrar'}
            </Button>
          </Stack>
        ) : (
          // ── Download phase ───────────────────────────────────────────────────
          <Stack spacing={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              Escolhe o intervalo de datas. Deixa a data fim em branco para o máximo disponível.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            {status && !error && (
              <Alert severity="info" icon={<CircularProgress size={18} />}>{status}</Alert>
            )}
            <Box display="flex" gap={2}>
              <TextField
                label="Data início"
                type="date"
                value={beginDate}
                onChange={(e) => setBeginDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                fullWidth
              />
              <TextField
                label="Data fim"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                fullWidth
              />
            </Box>
            <Button
              variant="contained"
              onClick={() => runDownload(false)}
              disabled={downloading || importing}
              startIcon={downloading ? <CircularProgress size={18} color="inherit" /> : <CloudDownload />}
            >
              {downloading ? status || 'A descarregar…' : 'Descarregar escala'}
            </Button>
            <Link
              component="button"
              type="button"
              variant="caption"
              color="text.secondary"
              underline="hover"
              onClick={() => setSessionToken(null)}
              sx={{ alignSelf: 'flex-start' }}
            >
              Terminar sessão CrewLink
            </Link>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
