import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, InputAdornment, Link, List, ListItemButton, ListItemIcon, ListItemText,
  Snackbar, Stack, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import {
  Close, Visibility, VisibilityOff, CheckCircle, Science, CalendarMonth, DeleteOutline, BugReport,
  DarkMode, LightMode, InfoOutlined, Backup, Restore, School, CloudDownload, ChevronRight,
  PersonOutline, EuroOutlined, TuneOutlined, StorageOutlined, HelpOutline,
} from '@mui/icons-material';
import readmeText from '../../README.md?raw';
import { useNavigate } from 'react-router-dom';
import { useColorMode } from '../state/colorMode';
import {
  API_KEY_PATTERN, getAeroDataBoxKey, setAeroDataBoxKey,
  CHECKIN_LEAD_OPTIONS, getCheckinLeadMinutes, setCheckinLeadMinutes,
  getCredentials, setCredentials,
  getLogbookFunction, setLogbookFunction, type LogbookFunction,
} from '../storage/settings';
import { fetchFlightInfo } from '../services/crewlinkApi';
import { APP_NAME, APP_VERSION_LABEL } from '../version';
import { DISCLAIMER_TEXT } from '../disclaimer';
import { operatedFlights } from '../domain/flightTime';
import { downloadIcs } from '../utils/icsExport';
import { startTour } from '../tour';
import { useRoster } from '../state/useRoster';
import { baseOf } from '../domain/dutyStats';
import type { CrewBase } from '../domain/types';
import PaySettingsSection from './PaySettingsSection';
import {
  downloadBackup, readBackupFile, restoreBackup, BackupError, type BackupSummary,
} from '../storage/backup';

// The dialog is split into tabs by subject; the last one opened is remembered on this device.
type SettingsTab = 'perfil' | 'vencimento' | 'app' | 'dados' | 'ajuda';
const TAB_KEY = 'crewroster.settingsTab';

function readTab(): SettingsTab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === 'perfil' || v === 'vencimento' || v === 'app' || v === 'dados' || v === 'ajuda') return v;
  } catch { /* storage blocked — fall back to the first tab */ }
  return 'perfil';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });

// In-app settings: lets the user paste their own AeroDataBox (RapidAPI) key so the day
// view can show aircraft registration, gate/terminal and status. The key is stored on
// this device only and forwarded to the proxy per request — never committed or shared.
export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { roster, clear, activeUser, setUserBase } = useRoster();
  const { mode, setMode } = useColorMode();
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  // CrewLink credentials saved on this device (per profile) to pre-fill the download dialog.
  const [credCode, setCredCode] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [showCred, setShowCred] = useState(false);
  // EASA logbook: which function (PIC / co-pilot) the printable logbook assigns block time to.
  const [logbookFn, setLogbookFn] = useState<LogbookFunction>('COPILOT');
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  // Transient confirmation popup (e.g. after saving CrewLink credentials).
  const [snack, setSnack] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [lead, setLead] = useState(getCheckinLeadMinutes());
  const [readmeOpen, setReadmeOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Read the credential inputs straight from the DOM on save: password managers (Bitwarden, etc.)
  // fill the field without firing React's onChange, so the controlled state can stay empty and an
  // empty password would be saved — then auto-login never triggers. The DOM value is authoritative.
  const credCodeRef = useRef<HTMLInputElement>(null);
  const credPasswordRef = useRef<HTMLInputElement>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<SettingsTab>(readTab);
  const isPilot = activeUser?.role !== 'cabin';

  function chooseTab(t: SettingsTab) {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* not persisted — harmless */ }
  }

  // Pay settings only exist for pilots (the RRRGS is the pilots' agreement); cabin crew get four tabs.
  const tabs: { id: SettingsTab; label: string; icon: ReactElement }[] = [
    { id: 'perfil', label: 'Perfil', icon: <PersonOutline /> },
    ...(isPilot && activeUser ? [{ id: 'vencimento' as const, label: 'Vencimento', icon: <EuroOutlined /> }] : []),
    { id: 'app', label: 'App', icon: <TuneOutlined /> },
    { id: 'dados', label: 'Dados', icon: <StorageOutlined /> },
    { id: 'ajuda', label: 'Ajuda', icon: <HelpOutline /> },
  ];
  // A remembered tab that this profile doesn't have (cabin crew → Vencimento) falls back to Perfil.
  const shownTab: SettingsTab = tabs.some((t) => t.id === tab) ? tab : 'perfil';

  // Period covered by the stored roster and when it was imported, for the Dados tab.
  const rosterSpan = useMemo(() => {
    if (!roster || roster.duties.length === 0) return null;
    const dates = roster.duties.map((d) => d.date).sort();
    const imported = new Date(roster.importedAt);
    return {
      from: fmtDay(dates[0]),
      to: fmtDay(dates[dates.length - 1]),
      imported: imported.toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    };
  }, [roster]);

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
      setLogbookFn(activeUser ? getLogbookFunction(activeUser.id) : 'COPILOT');
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
    // Prefer the live DOM value so a password-manager fill (no onChange) is still captured.
    const code = (credCodeRef.current?.value ?? credCode).trim();
    const pw = credPasswordRef.current?.value ?? credPassword;
    if (activeUser) {
      setCredentials(activeUser.id, { crewCode: code, password: pw });
      setLogbookFunction(activeUser.id, logbookFn);
    }
    // Keep React state in sync with what we actually saved.
    if (code !== credCode) setCredCode(code);
    if (pw !== credPassword) setCredPassword(pw);
    setSaved(true);
    if (code || pw) {
      setSnack('Credenciais do CrewLink guardadas neste dispositivo.');
    }
  }

  function handleForgetCredentials() {
    if (activeUser) setCredentials(activeUser.id, null);
    setCredCode('');
    setCredPassword('');
    setSaved(true);
    setSnack('Credenciais removidas deste dispositivo.');
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
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      // Fixed height so the tab bar doesn't jump when switching between short and long tabs.
      PaperProps={{ sx: { height: 'min(760px, calc(100% - 64px))' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box flexGrow={1}>Definições</Box>
        <IconButton onClick={onClose} size="small" aria-label="Fechar definições"><Close fontSize="small" /></IconButton>
      </DialogTitle>
      <Tabs
        value={shownTab}
        onChange={(_, v: SettingsTab) => chooseTab(v)}
        variant="fullWidth"
        aria-label="Secções das definições"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 56, '& .MuiTab-root': { minHeight: 56, minWidth: 0, px: 0.5, fontSize: '0.7rem', textTransform: 'none', fontWeight: 600 } }}
      >
        {tabs.map((t) => <Tab key={t.id} value={t.id} icon={t.icon} label={t.label} iconPosition="top" />)}
      </Tabs>
      <DialogContent sx={{ pt: 2 }}>
        {shownTab === 'perfil' && (
          <Stack spacing={2}>
            {activeUser && (
              <Box display="flex" alignItems="center" gap={1.5} sx={{ borderRadius: 2, bgcolor: 'action.hover', px: 1.5, py: 1.25 }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40, fontSize: '0.95rem', fontWeight: 700 }}>
                  {initials(activeUser.name)}
                </Avatar>
                <Box minWidth={0}>
                  <Typography variant="subtitle2" noWrap>{activeUser.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {activeUser.role === 'cabin' ? 'Cabina' : 'Piloto'} · perfil ativo neste dispositivo
                  </Typography>
                </Box>
              </Box>
            )}

            {activeUser && (
              /* The profile's home base: rest and FDP rules differ at base and away from it, and
                 the monthly stats count nights away from it. Saved on the profile right away. */
              <Box display="flex" alignItems="center" gap={1}>
                <Box flexGrow={1}>
                  <Typography variant="subtitle2">Base</Typography>
                  <Typography variant="body2" color="text.secondary">Descanso, FDP e noites fora</Typography>
                </Box>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={baseOf(activeUser)}
                  onChange={(_, v: CrewBase | null) => { if (v) setUserBase(activeUser.id, v); }}
                >
                  <ToggleButton value="LIS" sx={{ px: 1.5 }}>Lisboa</ToggleButton>
                  <ToggleButton value="OPO" sx={{ px: 1.5 }}>Porto</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}

            <Box display="flex" alignItems="center" gap={1}>
              <Box flexGrow={1}>
                <Typography variant="subtitle2">Função</Typography>
                <Typography variant="body2" color="text.secondary">Coluna da caderneta EASA</Typography>
              </Box>
              <ToggleButtonGroup
                size="small"
                exclusive
                color="primary"
                value={logbookFn}
                onChange={(_, v) => v && setLogbookFn(v)}
              >
                <ToggleButton value="PIC" sx={{ px: 1.5 }}>Cmte</ToggleButton>
                <ToggleButton value="COPILOT" sx={{ px: 1.5 }}>OP</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" gutterBottom>Acesso ao CrewLink</Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Preenche o download da escala (ícone <CloudDownload sx={{ fontSize: 14, verticalAlign: 'text-bottom' }} />)
                automaticamente. Fica guardado <strong>só neste dispositivo</strong>.
              </Typography>
              <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                <TextField
                  label="Código tripulante"
                  value={credCode}
                  onChange={(e) => setCredCode(e.target.value)}
                  inputRef={credCodeRef}
                  autoComplete="username"
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Password"
                  type={showCred ? 'text' : 'password'}
                  value={credPassword}
                  onChange={(e) => setCredPassword(e.target.value)}
                  inputRef={credPasswordRef}
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
                    <Button size="small" color="error" onClick={handleForgetCredentials} startIcon={<DeleteOutline />}>
                      Esquecer credenciais
                    </Button>
                  </Box>
                )}
              </Stack>
            </Box>
            {saved && (
              <Alert severity="success" icon={<CheckCircle fontSize="inherit" />}>
                Definições guardadas neste dispositivo.
              </Alert>
            )}
          </Stack>
        )}

        {shownTab === 'vencimento' && activeUser && <PaySettingsSection userId={activeUser.id} />}

        {shownTab === 'app' && (
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" gutterBottom>Aspeto</Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                fullWidth
                value={mode}
                onChange={(_, v) => { if (v) setMode(v); }}
              >
                <ToggleButton value="light" sx={{ gap: 0.75, py: 1.25 }}>
                  <LightMode fontSize="small" /> Claro
                </ToggleButton>
                <ToggleButton value="dark" sx={{ gap: 0.75, py: 1.25 }}>
                  <DarkMode fontSize="small" /> Escuro
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" gutterBottom>Lembrete de check-in</Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Alarme antes do check-in, ao exportar o calendário <strong>.ics</strong>.
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1} mt={0.5} role="group" aria-label="Antecedência do lembrete">
                {CHECKIN_LEAD_OPTIONS.map((m) => (
                  <Chip
                    key={m}
                    label={m === 0 ? 'Sem' : `${m} min`}
                    color={lead === m ? 'primary' : 'default'}
                    variant={lead === m ? 'filled' : 'outlined'}
                    onClick={() => { setLead(m); setCheckinLeadMinutes(m); }}
                    aria-pressed={lead === m}
                  />
                ))}
              </Box>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" gutterBottom>Dados de voo (AeroDataBox)</Typography>
              <Typography variant="body2" color="text.secondary">
                Matrícula, terminal/porta e estado do voo no detalhe do dia. Precisa da tua chave da API{' '}
                <strong>AeroDataBox</strong> (via{' '}
                <Link href="https://rapidapi.com/aedbx-aedbx/api/aerodatabox" target="_blank" rel="noopener">
                  RapidAPI
                </Link>, tem plano gratuito).
              </Typography>
              <Alert severity="info" sx={{ mt: 1, py: 0, fontSize: '0.78rem' }}>
                A chave é <strong>pessoal e gratuita</strong> (~100 pedidos/mês). Cada utilizador deve usar a{' '}
                <strong>sua própria</strong>. Fica só neste dispositivo.
              </Alert>
            </Box>
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
                    <IconButton onClick={() => setShow((s) => !s)} edge="end" size="small" aria-label="Mostrar ou ocultar chave">
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
                Testar chave
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
            {saved && (
              <Alert severity="success" icon={<CheckCircle fontSize="inherit" />}>
                Definições guardadas neste dispositivo.
              </Alert>
            )}
          </Stack>
        )}

        {shownTab === 'dados' && (
          <Stack spacing={2}>
            {/* Roster actions, moved here from the list's overflow menu. */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>Escala</Typography>
              {rosterSpan ? (
                <Box display="flex" alignItems="center" gap={1.25} sx={{ borderRadius: 2, bgcolor: 'action.hover', px: 1.5, py: 1, mb: 1 }}>
                  <CalendarMonth color="primary" fontSize="small" />
                  <Box minWidth={0}>
                    <Typography variant="body2" fontWeight={600}>{rosterSpan.from} – {rosterSpan.to}</Typography>
                    <Typography variant="caption" color="text.secondary">Importada a {rosterSpan.imported}</Typography>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" gutterBottom>Sem escala importada.</Typography>
              )}
              <Stack spacing={1}>
                <Button
                  onClick={() => roster && downloadIcs(roster)}
                  disabled={!roster}
                  startIcon={<CalendarMonth />}
                  size="small"
                  variant="outlined"
                  fullWidth
                >
                  Exportar calendário .ics
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
              </Stack>
            </Box>

            <Divider />

            {/* Full backup / restore — survives uninstalling or clearing browser data. */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>Cópia de segurança</Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Guarda <strong>tudo</strong> (perfis, escalas, diário, documentos, PDFs e definições) num
                ficheiro. Exporta antes de desinstalar; importa depois de reinstalar.
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
              <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1}>
                <Button
                  onClick={handleExport}
                  disabled={backupBusy}
                  startIcon={backupBusy ? <CircularProgress size={16} /> : <Backup />}
                  size="small"
                  variant="contained"
                >
                  Exportar
                </Button>
                <Button
                  onClick={() => fileInput.current?.click()}
                  disabled={backupBusy}
                  startIcon={<Restore />}
                  size="small"
                  variant="outlined"
                >
                  Importar
                </Button>
              </Box>
              {backupMsg && (
                <Alert severity={backupMsg.ok ? 'success' : 'warning'} sx={{ mt: 1 }}>
                  {backupMsg.text}
                </Alert>
              )}
            </Box>
          </Stack>
        )}

        {shownTab === 'ajuda' && (
          <Stack spacing={2}>
            <List disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
              {/* Replay the first-run guided tour. Close the dialog first so the balloons can
                  point at the AppBar/nav behind it. */}
              <ListItemButton onClick={() => { onClose(); setTimeout(() => startTour(), 300); }} divider>
                <ListItemIcon sx={{ minWidth: 40 }}><School color="primary" /></ListItemIcon>
                <ListItemText primary="Tutorial" secondary="Volta a ver a visita guiada" />
                <ChevronRight color="action" />
              </ListItemButton>
              <ListItemButton onClick={() => setReadmeOpen(true)} divider>
                <ListItemIcon sx={{ minWidth: 40 }}><InfoOutlined color="primary" /></ListItemIcon>
                <ListItemText primary="Documentação" secondary="Tudo o que a app faz" />
                <ChevronRight color="action" />
              </ListItemButton>
              {/* Diagnostics — moved out of the bottom bar into Settings. */}
              <ListItemButton onClick={() => { onClose(); navigate('/debug'); }}>
                <ListItemIcon sx={{ minWidth: 40 }}><BugReport color="primary" /></ListItemIcon>
                <ListItemText primary="Diagnóstico" secondary="Texto e tokens do PDF, para reportar erros" />
                <ChevronRight color="action" />
              </ListItemButton>
            </List>

            <Box>
              <Typography variant="subtitle2" gutterBottom>Sobre</Typography>
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
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, borderTop: 1, borderColor: 'divider' }}>
        <Box flexGrow={1} />
        <Button onClick={onClose} color="inherit">Fechar</Button>
        {/* Only these tabs hold fields that wait for Guardar; everything else saves as it changes. */}
        {(shownTab === 'perfil' || shownTab === 'app') && (
          <Button onClick={handleSave} variant="contained" disabled={invalid}>Guardar</Button>
        )}
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

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSnack(null)} sx={{ width: '100%' }}>
          {snack}
        </Alert>
      </Snackbar>
    </Dialog>
  );
}
