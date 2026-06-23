import { useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, Link, Stack, TextField, Typography,
} from '@mui/material';
import { CloudDownload, Close, Login, CheckCircle, NotificationsActive } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { login, fetchRoster, SessionExpiredError } from '../services/crewlinkApi';
import { useRoster, type RosterImportPreview } from '../state/useRoster';
import { savePdf } from '../storage/rosterStore';
import { addNotification } from '../storage/notifications';
import type { ChangeType, DayChange } from '../domain/types';

const CHANGE_META: Record<ChangeType, { label: string; color: 'success' | 'warning' | 'error' }> = {
  added: { label: 'Novo', color: 'success' },
  modified: { label: 'Alterado', color: 'warning' },
  removed: { label: 'Removido', color: 'error' },
};

// Per-day diff: a count chip per change type, then the affected dates. Reused by the
// notification (pre-confirmation) and the normal-download review phases.
function DiffView({ changes }: { changes: DayChange[] }) {
  if (changes.length === 0) {
    return <Alert severity="success" sx={{ py: 0 }}>Sem alterações face à escala atual.</Alert>;
  }
  return (
    <>
      <Box display="flex" gap={1} flexWrap="wrap">
        {(['modified', 'removed', 'added'] as ChangeType[]).map((t) => {
          const n = changes.filter((c) => c.type === t).length;
          return n ? (
            <Chip key={t} size="small" color={CHANGE_META[t].color} sx={{ color: '#fff' }}
              label={`${n} ${CHANGE_META[t].label.toLowerCase()}${n > 1 ? 's' : ''}`} />
          ) : null;
        })}
      </Box>
      <Box sx={{ maxHeight: 220, overflowY: 'auto', p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
        <Stack spacing={0.5}>
          {changes.map((c) => (
            <Box key={c.date} display="flex" alignItems="center" gap={1}>
              <Chip size="small" color={CHANGE_META[c.type].color} sx={{ color: '#fff', minWidth: 82 }}
                label={CHANGE_META[c.type].label} />
              <Typography variant="body2">{format(parseISO(c.date), 'EEE, dd MMM yyyy')}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function toCrewLinkDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}${MONTHS[parseInt(m) - 1]}${y}`;
}

// One-stop modal to pull the roster straight from CrewLink while staying on the main
// page: authenticate if needed, pick a date range, download → parse → the roster view
// updates in place (and the diff banner fires if anything changed).
export default function DownloadRosterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sessionToken, setSessionToken, previewImport, applyImport, importing, activeUser } = useRoster();

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
  // After a download, the parsed-but-not-saved roster + its diff, shown for review when it
  // actually changes existing days. The buffer is kept so we can save the PDF on apply.
  const [preview, setPreview] = useState<RosterImportPreview | null>(null);
  const [pendingBuffer, setPendingBuffer] = useState<ArrayBuffer | null>(null);
  // Notification text to record in the banner once the reviewed roster is applied.
  const [recordNotifText, setRecordNotifText] = useState<string | null>(null);

  function resetReview() {
    setPreview(null);
    setPendingBuffer(null);
    setRecordNotifText(null);
  }

  function handleClose() {
    if (downloading || authLoading) return;
    setDone(false);
    setError(null);
    setStatus('');
    setPassword('');
    setPendingNotification(null);
    resetReview();
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

  // Parse the downloaded PDF WITHOUT saving and decide what to do: if it changes existing
  // days (modified/removed) show the diff for review; otherwise (first import, new period,
  // or no change) apply straight away.
  async function processPdf(buffer: ArrayBuffer, notificationText?: string) {
    setStatus('PDF recebido. A analisar alterações…');
    const fileName = `escala-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`;
    const file = new File([new Blob([buffer], { type: 'application/pdf' })], fileName, { type: 'application/pdf' });
    const pv = await previewImport(file);
    const hasRealChanges = pv.changes.some((c) => c.type !== 'added');
    setPendingNotification(null);
    if (hasRealChanges) {
      // Hold for review — nothing is written to the roster until the user applies.
      setPendingBuffer(buffer);
      setRecordNotifText(notificationText ?? null);
      setPreview(pv);
      setStatus('');
    } else {
      await commitPreview(buffer, pv, notificationText);
    }
  }

  // Persist the PDF, apply the reviewed roster and record the notification (if any).
  async function commitPreview(buffer: ArrayBuffer, pv: RosterImportPreview, notificationText?: string | null) {
    setStatus('A guardar…');
    const blob = new Blob([buffer], { type: 'application/pdf' });
    await savePdf({
      id: crypto.randomUUID(),
      userId: activeUser?.id,
      fileName: pv.next.fileName,
      blob,
      downloadedAt: new Date().toISOString(),
      beginDate: beginDate || null,
      endDate: endDate || null,
    });
    await applyImport(pv);
    if (notificationText && activeUser) addNotification(activeUser.id, notificationText);
    resetReview();
    setStatus('');
    setDone(true);
  }

  async function applyReviewed() {
    if (!preview || !pendingBuffer) return;
    setDownloading(true);
    try {
      await commitPreview(pendingBuffer, preview, recordNotifText);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao aplicar a escala.');
    } finally {
      setDownloading(false);
    }
  }

  const buildOptions = (confirm: boolean) => ({
    sessionToken: sessionToken!,
    ...(beginDate ? { beginDate: toCrewLinkDate(beginDate) } : {}),
    ...(endDate ? { endDate: toCrewLinkDate(endDate) } : {}),
    ...(confirm ? { confirmNotification: true } : {}),
  });

  function handleDownloadError(e: unknown) {
    if (e instanceof SessionExpiredError) {
      setSessionToken(null); // volta ao ecrã de login automaticamente
      setPendingNotification(null);
      resetReview();
    } else {
      setError(e instanceof Error ? e.message : 'Erro ao obter a escala.');
    }
    setStatus('');
  }

  // Initial download (no confirmation). If CrewLink blocks the period with an unread
  // notification, its pop-up already carries the roster PDF — so we parse it and show the
  // changes right there, before the user confirms.
  async function runDownload() {
    if (!sessionToken || !activeUser) return; // never save a PDF without a concrete owner
    setDownloading(true);
    setError(null);
    setDone(false);
    setStatus('A descarregar do CrewLink…');
    try {
      const result = await fetchRoster(buildOptions(false));
      if (result.type === 'notification') {
        setPendingNotification(result.text || '(Sem texto na notificação.)');
        setStatus('');
        // Pre-fetched PDF from the notification pop-up → preview the changes now.
        if (result.buffer) {
          try {
            const fileName = `escala-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`;
            const file = new File([new Blob([result.buffer], { type: 'application/pdf' })], fileName, { type: 'application/pdf' });
            setPreview(await previewImport(file));
            setPendingBuffer(result.buffer);
            setRecordNotifText(result.text || null);
          } catch { /* show the text even if the preview fails */ }
        }
        return;
      }
      if (result.sessionToken && result.sessionToken !== sessionToken) setSessionToken(result.sessionToken);
      await processPdf(result.buffer);
    } catch (e) {
      handleDownloadError(e);
    } finally {
      setDownloading(false);
    }
  }

  // Notification "Confirmar": acknowledge it on CrewLink (required there to clear it), then
  // apply the roster the user just reviewed. The post-ack PDF is authoritative, so we use
  // it rather than the pre-fetched preview.
  async function confirmNotification() {
    if (!sessionToken || !activeUser) return;
    setDownloading(true);
    setError(null);
    setStatus('A confirmar notificação…');
    try {
      const result = await fetchRoster(buildOptions(true));
      if (result.type === 'notification') {
        // Still pending (unexpected) — keep showing it.
        setPendingNotification(result.text || '(Sem texto na notificação.)');
        setStatus('');
        return;
      }
      if (result.sessionToken && result.sessionToken !== sessionToken) setSessionToken(result.sessionToken);
      const fileName = `escala-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`;
      const file = new File([new Blob([result.buffer], { type: 'application/pdf' })], fileName, { type: 'application/pdf' });
      const pv = await previewImport(file);
      await commitPreview(result.buffer, pv, pendingNotification ?? undefined);
    } catch (e) {
      handleDownloadError(e);
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
          // ── Notification phase: message + (pre-confirmation) diff ────────────
          <Stack spacing={2} pt={0.5}>
            <Alert severity="warning" icon={<NotificationsActive />}>
              O CrewLink tem uma notificação por ler para este período.{' '}
              {preview ? 'Revê a mensagem e as alterações abaixo.' : 'Lê-a abaixo.'} Ao
              confirmares, marcas a notificação como lida no CrewLink e a escala é aplicada.
            </Alert>
            {error && <Alert severity="error">{error}</Alert>}
            <Box
              sx={{
                maxHeight: 200, overflowY: 'auto', p: 1.5, borderRadius: 1,
                bgcolor: 'action.hover', whiteSpace: 'pre-wrap', fontSize: 13,
              }}
            >
              {pendingNotification}
            </Box>
            {preview && (
              <>
                <Typography variant="subtitle2">Alterações nesta escala</Typography>
                <DiffView changes={preview.changes} />
              </>
            )}
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained" color="primary" fullWidth
                onClick={confirmNotification} disabled={downloading}
                startIcon={downloading ? <CircularProgress size={18} color="inherit" /> : <CheckCircle />}
              >
                {downloading ? 'A confirmar…' : 'Confirmar e aplicar'}
              </Button>
              <Button variant="outlined" color="inherit" fullWidth onClick={handleClose} disabled={downloading}>
                Fechar
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Se fechares, nada é alterado e a notificação fica por confirmar.
            </Typography>
          </Stack>
        ) : preview ? (
          // ── Review phase (normal download that changed existing days) ────────
          <Stack spacing={2} pt={0.5}>
            <Alert severity="info">
              Escala descarregada. Revê as alterações — nada é guardado até carregares
              em <strong>Aplicar</strong>.
            </Alert>
            {error && <Alert severity="error">{error}</Alert>}
            <DiffView changes={preview.changes} />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" fullWidth onClick={applyReviewed} disabled={downloading}
                startIcon={downloading ? <CircularProgress size={18} color="inherit" /> : <CheckCircle />}>
                {downloading ? 'A aplicar…' : 'Aplicar à escala'}
              </Button>
              <Button variant="outlined" color="inherit" fullWidth onClick={handleClose} disabled={downloading}>
                Descartar
              </Button>
            </Stack>
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
                inputProps={{ style: { fontSize: '0.8rem' } }}
                size="small"
                fullWidth
              />
              <TextField
                label="Data fim"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ style: { fontSize: '0.8rem' } }}
                size="small"
                fullWidth
              />
            </Box>
            <Button
              variant="contained"
              onClick={runDownload}
              disabled={downloading || importing}
              startIcon={downloading ? <CircularProgress size={18} color="inherit" /> : <CloudDownload />}
            >
              Descarregar escala
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
