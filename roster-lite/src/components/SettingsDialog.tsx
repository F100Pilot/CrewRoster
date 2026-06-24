import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, InputAdornment, Link, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import { Close, Visibility, VisibilityOff, CheckCircle, Science, CalendarMonth, DeleteOutline, BugReport, DarkMode, LightMode, InfoOutlined, Backup, Restore, School, CloudDownload } from '@mui/icons-material';
import readmeText from '../../README.md?raw';
import { useNavigate } from 'react-router-dom';
import { useColorMode } from '../state/colorMode';
import {
  API_KEY_PATTERN, getAeroDataBoxKey, setAeroDataBoxKey,
  CHECKIN_LEAD_OPTIONS, getCheckinLeadMinutes, setCheckinLeadMinutes,
  getCredentials, setCredentials,
} from '../storage/settings';
import { fetchFlightInfo } from '../services/crewlinkApi';
import { APP_NAME, APP_VERSION_LABEL } from '../version';
import { DISCLAIMER_TEXT } from '../disclaimer';
import { operatedFlights } from '../domain/flightTime';
import { downloadIcs } from '../utils/icsExport';
import { startTour } from '../tour';
import { useRoster } from '../state/useRoster';
import {
  downloadBackup, readBackupFile, restoreBackup, BackupError, type BackupSummary,
} from '../storage/backup';

// In-app settings: lets the user paste their own AeroDataBox (RapidAPI) key so the day
// view can show aircraft registration, gate/terminal and status. The key is stored on
// this device only and forwarded to the proxy per request — never committed or shared.
export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { roster, clear, activeUser } = useRoster();
  const { mode, setMode } = useColorMode();
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  // CrewLink credentials saved on this device (per profile) to pre-fill the download dialog.
  const [credCode, setCredCode] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [showCred, setShowCred] = useState(false);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [lead, setLead] = useState(getCheckinLeadMinutes());
  const [readmeOpen, setReadmeOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Load the stored key whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setKey(getAeroDataBoxKey());
      setSaved(false);
      setShow(false);
      setTestResult(null);
      setConfirmClear(false);
      setLead(getCheckinLeadMinutes());
      setShowCred(false);
      const cred = activeUser ? getCredentials(activeUser.id) : null;
      setCredCode(cred?.crewCode ?? activeUser?.crewCode ?? '');
      setCredPassword(cred?.password ?? '');
    }
  }, [open, activeUser]);

  // Wiping the roster is destructive, so the first tap arms a confirm and the second
  // actually clears and closes the dialog.
  function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return; }
    clear();
    setConfirmClear(false);
    onClose();
  }

  function summaryText(s: BackupSummary): string {
    return `${s.users} perfil(is), ${s.sectors} sectores, ${s.documents} documento(s), ${s.pdfs} PDF(s).`;
  }

  // Export everything (all profiles, rosters, logbook, documents, saved PDFs, settings)
  // to a single JSON file the user can keep and re-import after reinstalling.
  async function handleExport() {
    setBackupBusy(true);
    setBackupMsg(null);
    try {
      const s = await downloadBackup();
      setBackupMsg({ ok: true, text: `Cópia de segurança criada — ${summaryText(s)}` });
    } catch (e) {
      setBackupMsg({ ok: false, text: `Falha a exportar: ${e instanceof Error ? e.message : 'erro'}.` });
    }
    setBackupBusy(false);
  }

  // Import replaces all current data, then reloads so the app picks up the restored state.
  async function handleImportFile(file: File) {
    setBackupBusy(true);
    setBackupMsg(null);
    try {
      const { backup, summary } = await readBackupFile(file);
      const ok = window.confirm(
        `Importar esta cópia de segurança vai SUBSTITUIR todos os dados atuais.\n\n` +
        `Conteúdo: ${summaryText(summary)}\nCriada em ${new Date(backup.createdAt).toLocaleString('pt-PT')}.\n\nContinuar?`,
      );
      if (!ok) { setBackupBusy(false); return; }
      await restoreBackup(backup, true);
      setBackupMsg({ ok: true, text: 'Dados importados. A recarregar…' });
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      const msg = e instanceof BackupError ? e.message : `Falha a importar: ${e instanceof Error ? e.message : 'erro'}.`;
      setBackupMsg({ ok: false, text: msg });
      setBackupBusy(false);
    }
  }

  const trimmed = key.trim();
  const invalid = trimmed !== '' && !API_KEY_PATTERN.test(trimmed);

  function handleSave() {
    if (invalid) return;
    setAeroDataBoxKey(trimmed);
    if (activeUser) {
      setCredentials(activeUser.id, { crewCode: credCode.trim(), password: credPassword });
    }
    setSaved(true);
  }

  function handleForgetCredentials() {
    if (activeUser) setCredentials(activeUser.id, null);
    setCredCode('');
    setCredPassword('');
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
        <IconButton onClick={onClose} size="small" aria-label="Fechar definições"><Close fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box display="flex" alignItems="center" gap={1}>
            <Box flexGrow={1}>
              <Typography variant="subtitle2">Aspeto</Typography>
              <Typography variant="body2" color="text.secondary">Tema da aplicação</Typography>
            </Box>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={mode}
              onChange={(_, v) => { if (v) setMode(v); }}
            >
              <ToggleButton value="light" sx={{ gap: 0.5, px: 1.5 }}>
                <LightMode fontSize="small" /> Claro
              </ToggleButton>
              <ToggleButton value="dark" sx={{ gap: 0.5, px: 1.5 }}>
                <DarkMode fontSize="small" /> Escuro
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" gutterBottom>Acesso ao CrewLink</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Guarda o teu código de tripulante e password para preencherem automaticamente o
              download da escala (ícone <CloudDownload sx={{ fontSize: 14, verticalAlign: 'text-bottom' }} />).
              Ficam guardados <strong>só neste dispositivo</strong>.
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 0.5 }}>
              <TextField
                label="Código tripulante"
                value={credCode}
                onChange={(e) => setCredCode(e.target.value)}
                autoComplete="username"
                size="small"
                fullWidth
              />
              <TextField
                label="Password"
                type={showCred ? 'text' : 'password'}
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                autoComplete="current-password"
                size="small"
                fullWidth
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowCred((s) => !s)} edge="end" aria-label="Mostrar ou ocultar password">
                        {showCred ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              {(credCode || credPassword) && (
                <Box>
                  <Button size="small" color="inherit" onClick={handleForgetCredentials} startIcon={<DeleteOutline />}>
                    Esquecer credenciais
                  </Button>
                </Box>
              )}
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" gutterBottom>Lembrete de check-in</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Alarme antes do check-in, aplicado ao exportar <strong>.ics</strong> e ao
              sincronizar com o Google Calendar.
            </Typography>
            <TextField
              select
              size="small"
              value={lead}
              onChange={(e) => { const v = Number(e.target.value); setLead(v); setCheckinLeadMinutes(v); }}
              SelectProps={{ native: true }}
              sx={{ mt: 0.5 }}
            >
              {CHECKIN_LEAD_OPTIONS.map((m) => (
                <option key={m} value={m}>{m === 0 ? 'Desligado' : `${m} min antes`}</option>
              ))}
            </TextField>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" gutterBottom>Dados de voo (AeroDataBox)</Typography>
            <Typography variant="body2" color="text.secondary">
              Mostra matrícula da aeronave, terminal/porta e estado do voo no detalhe do
              dia. Precisa da tua chave da API <strong>AeroDataBox</strong> (via{' '}
              <Link href="https://rapidapi.com/aedbx-aedbx/api/aerodatabox" target="_blank" rel="noopener">
                RapidAPI
              </Link>, tem plano gratuito).
            </Typography>
            <Alert severity="info" sx={{ mt: 1, py: 0, fontSize: '0.78rem' }}>
              A chave é <strong>pessoal e gratuita</strong> (~100 pedidos/mês). Cada
              utilizador deve usar a <strong>sua própria</strong> — assim cada um tem a
              sua quota. Fica só neste dispositivo.
            </Alert>
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
          <Box display="flex" gap={1} flexWrap="wrap">
            <Button
              onClick={handleTest}
              disabled={testing || invalid || !trimmed}
              startIcon={testing ? <CircularProgress size={16} /> : <Science />}
              size="small"
              variant="outlined"
            >
              Testar ligação
            </Button>
            <Button
              onClick={handleRemove}
              disabled={!getAeroDataBoxKey()}
              startIcon={<DeleteOutline />}
              size="small"
              variant="outlined"
              color="error"
            >
              Remover chave
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

          {/* Full backup / restore — survives uninstalling or clearing browser data. */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Cópia de segurança</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Guarda <strong>tudo</strong> (perfis, escalas, diário, documentos, PDFs e
              definições) num ficheiro. Antes de desinstalar, exporta; depois de
              reinstalar, importa esse ficheiro para recuperares tudo.
            </Typography>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ''; // allow re-selecting the same file
                if (f) handleImportFile(f);
              }}
            />
            <Stack spacing={1}>
              <Button
                onClick={handleExport}
                disabled={backupBusy}
                startIcon={backupBusy ? <CircularProgress size={16} /> : <Backup />}
                size="small"
                variant="outlined"
                fullWidth
              >
                Exportar para ficheiro
              </Button>
              <Button
                onClick={() => fileInput.current?.click()}
                disabled={backupBusy}
                startIcon={<Restore />}
                size="small"
                variant="outlined"
                fullWidth
              >
                Importar de ficheiro
              </Button>
            </Stack>
            {backupMsg && (
              <Alert severity={backupMsg.ok ? 'success' : 'warning'} sx={{ mt: 1 }}>
                {backupMsg.text}
              </Alert>
            )}
          </Box>

          <Divider />

          {/* Replay the first-run guided tour. Close the dialog first so the balloons can
              point at the AppBar/nav behind it. */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Tutorial</Typography>
            <Button
              onClick={() => { onClose(); setTimeout(() => startTour(), 300); }}
              startIcon={<School />}
              size="small"
              variant="outlined"
            >
              Ver tutorial
            </Button>
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

          <Divider />

          <Box>
            <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Sobre</Typography>
              <IconButton size="small" onClick={() => setReadmeOpen(true)} title="Documentação" aria-label="Abrir documentação">
                <InfoOutlined fontSize="small" />
              </IconButton>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {APP_NAME} {APP_VERSION_LABEL}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Criado por Paulo Morais
            </Typography>
            <Typography variant="body2">
              <Link href="mailto:pflm.bet@gmail.com">pflm.bet@gmail.com</Link>
            </Typography>
            <Alert severity="warning" variant="outlined" sx={{ mt: 1.5, py: 0.5 }}>
              <Typography variant="body2">{DISCLAIMER_TEXT}</Typography>
            </Alert>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Box flexGrow={1} />
        <Button onClick={onClose} color="inherit">Fechar</Button>
        <Button onClick={handleSave} variant="contained" disabled={invalid}>Guardar</Button>
      </DialogActions>

      {/* README viewer */}
      <Dialog open={readmeOpen} onClose={() => setReadmeOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
          <Box flexGrow={1}>Documentação</Box>
          <IconButton onClick={() => setReadmeOpen(false)} size="small" aria-label="Fechar documentação"><Close fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box
            component="pre"
            sx={{
              m: 0, p: 2,
              fontFamily: 'monospace',
              fontSize: '0.72rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowX: 'hidden',
              color: 'text.primary',
            }}
          >
            {readmeText}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReadmeOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
