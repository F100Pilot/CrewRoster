import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, Link, Stack, TextField, Typography,
} from '@mui/material';
import { CloudDownload, Close, Login, CheckCircle, NotificationsActive } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { login, fetchRoster, SessionExpiredError } from '../services/crewlinkApi';
import { useRoster, type RosterImportPreview } from '../state/useRoster';
import { savePdf } from '../storage/rosterStore';
import { getCredentials } from '../storage/settings';
import { addNotification } from '../storage/notifications';
import { parseNotificationPdf, type NotificationReport } from '../parsing/pdf/notificationReport';
import type { ChangeType, DayChange, ParsedDuty } from '../domain/types';

const CHANGE_META: Record<ChangeType, { label: string; color: 'success' | 'warning' | 'error' }> = {
  added: { label: 'Novo', color: 'success' },
  modified: { label: 'Alterado', color: 'warning' },
  removed: { label: 'Removido', color: 'error' },
};

// One-line summary of a day's duties: flights as "TP123 LIS-OPO", other duties by code.
function summarizeDay(duties: ParsedDuty[]): string {
  if (duties.length === 0) return '—';
  return duties
    .map((d) => (d.flightNumber
      ? `${d.flightNumber}${d.departureAirport ? ` ${d.departureAirport}-${d.arrivalAirport ?? ''}` : ''}`
      : d.dutyCode))
    .join(', ');
}

function groupByDate(list: ParsedDuty[]): Map<string, ParsedDuty[]> {
  const m = new Map<string, ParsedDuty[]>();
  for (const d of list) {
    const arr = m.get(d.date) ?? [];
    arr.push(d);
    m.set(d.date, arr);
  }
  return m;
}

// Per-day diff: a count chip per change type, then each affected date with what changed
// (before → after). Reused by the notification (pre-confirmation) and review phases.
function DiffView({ changes, prevDuties, nextDuties }: {
  changes: DayChange[]; prevDuties: ParsedDuty[]; nextDuties: ParsedDuty[];
}) {
  if (changes.length === 0) {
    return <Alert severity="success" sx={{ py: 0 }}>Sem alterações face à escala atual.</Alert>;
  }
  const prev = groupByDate(prevDuties);
  const next = groupByDate(nextDuties);
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
      <Box sx={{ maxHeight: 240, overflowY: 'auto', p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
        <Stack spacing={1}>
          {changes.map((c) => {
            const before = summarizeDay(prev.get(c.date) ?? []);
            const after = summarizeDay(next.get(c.date) ?? []);
            const detail = c.type === 'added' ? after : c.type === 'removed' ? before : `${before} → ${after}`;
            return (
              <Box key={c.date}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Chip size="small" color={CHANGE_META[c.type].color} sx={{ color: '#fff', minWidth: 82 }}
                    label={CHANGE_META[c.type].label} />
                  <Typography variant="body2" fontWeight={600}>
                    {format(parseISO(c.date), 'EEE, dd MMM yyyy')}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 0.5, mt: 0.25, wordBreak: 'break-word' }}>
                  {detail}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </Box>
    </>
  );
}

// The CrewLink notification page embeds the report in an iframe, leaving "browser does
// not support embedded frames…" fallback text. We already fetch and parse that report, so
// strip the noise and keep the meaningful lines (e.g. the notification id to confirm).
function cleanNotificationText(text: string): string {
  return text
    .split('\n')
    .filter((l) => !/does not support embedded frames|open the report in an extra window|^\s*click here/i.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
  const { roster, sessionToken, setSessionToken, previewImport, applyImport, importing, activeUser } = useRoster();

  const [crewCode, setCrewCode] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // Hidden auto-login when saved credentials exist, so the login form is skipped.
  const [autoLoggingIn, setAutoLoggingIn] = useState(false);
  const autoTried = useRef(false);
  // Read the manual login fields from the DOM on submit: a password manager can fill them without
  // firing React's onChange, leaving the controlled state empty (which would also keep the button
  // disabled). The DOM value is authoritative.
  const loginCodeRef = useRef<HTMLInputElement>(null);
  const loginPwRef = useRef<HTMLInputElement>(null);

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
  // Parsed "Crew Notification" report (known → current per changed day), shown in the
  // notification phase before confirming.
  const [notifReport, setNotifReport] = useState<NotificationReport | null>(null);

  // Pre-fill the login fields from the ACTIVE user's saved credentials (resetting whenever the
  // dialog opens or the active profile changes, so one profile's code/password never lingers for
  // another) — and, when BOTH are saved, sign in automatically in the background and jump straight
  // to the date-range step. The login form only appears when there are no saved credentials or the
  // hidden sign-in fails.
  useEffect(() => {
    if (!open) { autoTried.current = false; return; }
    if (sessionToken) return;
    const cred = activeUser ? getCredentials(activeUser.id) : null;
    setCrewCode(cred?.crewCode ?? activeUser?.crewCode ?? '');
    setPassword(cred?.password ?? '');
    if (!autoTried.current && cred?.crewCode && cred?.password) {
      autoTried.current = true;
      setAutoLoggingIn(true);
      setAuthError(null);
      login(cred.crewCode, cred.password)
        .then((token) => { setSessionToken(token); setPassword(''); })
        .catch((e) => setAuthError(e instanceof Error ? e.message : 'Erro de autenticação.'))
        .finally(() => setAutoLoggingIn(false));
    }
  }, [open, sessionToken, activeUser, setSessionToken]);

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
    setNotifReport(null);
    resetReview();
    onClose();
  }

  async function handleLogin() {
    const code = (loginCodeRef.current?.value ?? crewCode).trim();
    const pw = loginPwRef.current?.value ?? password;
    if (!code || !pw) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const token = await login(code, pw);
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
  // notification, show its message; the real changes are reviewed after confirming (the
  // duty plan only exists once the notification is acknowledged).
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
        // Parse the notification report PDF to show the before → after of each changed day.
        if (result.buffer) {
          try { setNotifReport(await parseNotificationPdf(result.buffer)); } catch { /* text only */ }
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

  // Notification "Confirmar e aplicar": the user already reviewed the before → after, so
  // acknowledge the notification on CrewLink (required there to release the duty plan),
  // download the authoritative roster and apply it directly.
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
      const notifText = pendingNotification ?? undefined;
      setPendingNotification(null);
      setNotifReport(null);
      const fileName = `escala-${format(new Date(), 'yyyyMMdd-HHmm')}.pdf`;
      const file = new File([new Blob([result.buffer], { type: 'application/pdf' })], fileName, { type: 'application/pdf' });
      const pv = await previewImport(file);
      await commitPreview(result.buffer, pv, notifText);
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
        <IconButton onClick={handleClose} size="small" disabled={downloading || authLoading} aria-label="Fechar">
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
          // ── Notification phase: message + before → after from the report ──────
          <Stack spacing={2} pt={0.5}>
            <Alert severity="warning" icon={<NotificationsActive />}>
              O CrewLink tem uma notificação por ler para este período.{' '}
              {notifReport && notifReport.changes.length > 0
                ? 'Vê as alterações abaixo.'
                : 'Lê-a abaixo.'}{' '}
              Ao confirmares, marca-la como lida no CrewLink e a escala é atualizada.
            </Alert>
            {error && <Alert severity="error">{error}</Alert>}

            {notifReport && notifReport.changes.length > 0 ? (
              <Stack spacing={1.5}>
                {notifReport.changes.map((c) => (
                  <Box key={c.date} sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                    <Typography variant="subtitle2">
                      {/^\d{4}-/.test(c.date) ? format(parseISO(c.date), 'EEE, dd MMM yyyy') : c.rawDate}
                    </Typography>
                    <Box display="flex" gap={1} alignItems="flex-start" mt={0.5}>
                      <Chip size="small" color="warning" label="Antes" sx={{ color: '#fff', minWidth: 64 }} />
                      <Typography variant="body2" sx={{ flex: 1 }}>{c.known.join('; ') || '—'}</Typography>
                    </Box>
                    <Box display="flex" gap={1} alignItems="flex-start" mt={0.5}>
                      <Chip size="small" color="success" label="Depois" sx={{ color: '#fff', minWidth: 64 }} />
                      <Typography variant="body2" sx={{ flex: 1 }}>{c.current.join('; ') || '—'}</Typography>
                    </Box>
                  </Box>
                ))}
                {notifReport.notificationId && (
                  <Typography variant="caption" color="text.secondary">
                    Notificação {notifReport.notificationId}
                  </Typography>
                )}
              </Stack>
            ) : (
              <Box
                sx={{
                  maxHeight: 220, overflowY: 'auto', p: 1.5, borderRadius: 1,
                  bgcolor: 'action.hover', whiteSpace: 'pre-wrap', fontSize: 13,
                }}
              >
                {cleanNotificationText(pendingNotification)}
              </Box>
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
            <DiffView
              changes={preview.changes}
              prevDuties={roster?.duties ?? []}
              nextDuties={preview.next.duties}
            />
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
          autoLoggingIn ? (
            // ── Hidden auto-login (saved credentials) ──────────────────────────
            <Stack alignItems="center" spacing={1.5} py={3}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">A iniciar sessão no CrewLink…</Typography>
            </Stack>
          ) : (
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
              inputRef={loginCodeRef}
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
              inputRef={loginPwRef}
              disabled={authLoading}
              autoComplete="current-password"
              size="small"
              fullWidth
            />
            <Button
              variant="contained"
              onClick={handleLogin}
              disabled={authLoading}
              startIcon={authLoading ? <CircularProgress size={18} color="inherit" /> : <Login />}
            >
              {authLoading ? 'A autenticar…' : 'Entrar'}
            </Button>
          </Stack>
          )
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
