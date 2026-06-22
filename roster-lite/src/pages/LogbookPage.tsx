import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, IconButton, LinearProgress, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { ArrowBack, Download, FlightTakeoff, Sync } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { logbookEntries, logbookCsv, landingsInWindow } from '../domain/logbook';
import { backfillRegs, regMap, type BackfillResult } from '../domain/aircraftRegs';
import { flightMinutes } from '../domain/flightTime';
import { getAeroDataBoxKey } from '../storage/settings';
import type { AircraftReg } from '../domain/types';
import { formatDuration } from '../utils/duration';
import { downloadBlob } from '../utils/download';
import { format, parseISO } from 'date-fns';

// Recency requirement: 3 take-offs and landings in the preceding 90 days.
const RECENCY_REQUIRED = 3;
const RECENCY_DAYS = 90;

export default function LogbookPage() {
  const navigate = useNavigate();
  const { roster, activeUser } = useRoster();

  const duties = roster?.duties ?? [];
  const userId = activeUser?.id;

  // Recorded aircraft registrations (kept apart from the roster so re-downloads don't
  // wipe them). Loaded per user and refreshed after a backfill.
  const [regs, setRegs] = useState<Map<string, AircraftReg>>(new Map());
  const reloadRegs = useCallback(() => {
    if (userId) regMap(userId).then(setRegs);
    else setRegs(new Map());
  }, [userId]);
  useEffect(() => { reloadRegs(); }, [reloadRegs]);

  const entries = useMemo(() => logbookEntries(duties, regs), [duties, regs]);
  const totalBlock = useMemo(() => flightMinutes(duties), [duties]);
  const landings90 = useMemo(
    () => landingsInWindow(duties, new Date().toISOString().slice(0, 10), RECENCY_DAYS),
    [duties]
  );
  const recencyOk = landings90 >= RECENCY_REQUIRED;
  const missingRegs = useMemo(() => entries.filter((e) => !e.reg && e.date <= new Date().toISOString().slice(0, 10)).length, [entries]);

  // ── Backfill past registrations from AeroDataBox ──────────────────────────────────
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; found: number } | null>(null);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const cancelRef = useRef(false);

  async function runBackfill() {
    if (!userId || running) return;
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: 0, found: 0 });
    cancelRef.current = false;
    try {
      const r = await backfillRegs(userId, duties, setProgress, () => cancelRef.current);
      setResult(r);
    } finally {
      setRunning(false);
      setProgress(null);
      reloadRegs();
    }
  }

  function exportCsv() {
    const csv = logbookCsv(entries);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const who = activeUser?.name?.replace(/\s+/g, '-').toLowerCase() ?? 'crew';
    downloadBlob(blob, `logbook-${who}.csv`);
  }

  const hasKey = !!getAeroDataBoxKey();
  const backfillMsg = (r: BackfillResult): string => {
    const base = `${r.found} matrícula(s) registada(s).`;
    if (r.stopped === 'quota') return `${base} Limite da API atingido — tenta mais tarde.`;
    if (r.stopped === 'not_configured') return 'Define a chave AeroDataBox nas Definições (⚙️) primeiro.';
    if (r.stopped === 'cancelled') return `${base} Cancelado.`;
    return `${base} Concluído.`;
  };

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" gap={1}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Diário de bordo</Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Download />}
          onClick={exportCsv}
          disabled={entries.length === 0}
        >
          CSV
        </Button>
      </Box>

      <Card variant="outlined">
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box display="flex" flexWrap="wrap" gap={1} alignItems="center">
            <FlightTakeoff fontSize="small" color="action" />
            <Chip size="small" variant="outlined" label={`${entries.length} setores`} />
            <Chip size="small" variant="outlined" label={`Bloco ${formatDuration(totalBlock)}`} />
            <Chip
              size="small"
              label={`Recência: ${landings90}/${RECENCY_REQUIRED} em ${RECENCY_DAYS}d`}
              color={recencyOk ? 'success' : 'warning'}
              sx={{ color: '#fff' }}
            />
          </Box>
          {!recencyOk && (
            <Typography variant="caption" color="warning.main" display="block" mt={1}>
              Abaixo de {RECENCY_REQUIRED} aterragens nos últimos {RECENCY_DAYS} dias (indicativo).
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Backfill the aircraft registrations flown on past sectors (AeroDataBox). */}
      {entries.length > 0 && (
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="body2" sx={{ flexGrow: 1 }}>
                Matrículas registadas: {entries.length - missingRegs}/{entries.length}
              </Typography>
              <Button
                size="small"
                variant="contained"
                startIcon={<Sync />}
                onClick={runBackfill}
                disabled={running || !hasKey || missingRegs === 0}
              >
                {running ? 'A buscar…' : 'Buscar matrículas'}
              </Button>
              {running && (
                <Button size="small" color="inherit" onClick={() => { cancelRef.current = true; }}>
                  Parar
                </Button>
              )}
            </Box>
            {running && progress && (
              <Box mt={1}>
                <LinearProgress
                  variant={progress.total ? 'determinate' : 'indeterminate'}
                  value={progress.total ? (progress.done / progress.total) * 100 : undefined}
                />
                <Typography variant="caption" color="text.secondary">
                  {progress.done}/{progress.total} · {progress.found} encontradas
                </Typography>
              </Box>
            )}
            {!running && result && (
              <Alert severity={result.stopped === 'quota' || result.stopped === 'not_configured' ? 'warning' : 'success'} sx={{ mt: 1, py: 0 }}>
                {backfillMsg(result)}
              </Alert>
            )}
            {!hasKey && (
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Define a chave <strong>AeroDataBox</strong> nas Definições (⚙️) para registar matrículas.
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {entries.length === 0 ? (
        <Alert severity="info">Sem setores voados na escala importada.</Alert>
      ) : (
        <Card variant="outlined">
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ '& td, & th': { px: 1, whiteSpace: 'nowrap' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Data</TableCell>
                  <TableCell>Voo</TableCell>
                  <TableCell>Rota</TableCell>
                  <TableCell align="right">Bloco</TableCell>
                  <TableCell>Avião</TableCell>
                  <TableCell>Matrícula</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>{format(parseISO(e.date), 'dd/MM')}</TableCell>
                    <TableCell>{e.flightNumber}</TableCell>
                    <TableCell>{e.from}–{e.to}</TableCell>
                    <TableCell align="right">{formatDuration(e.blockMinutes)}</TableCell>
                    <TableCell>{e.aircraft}</TableCell>
                    <TableCell>{e.reg || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <Divider />
      <Typography variant="caption" color="text.secondary">
        Gerado a partir da escala importada. Não substitui o teu logbook oficial.
      </Typography>
    </Stack>
  );
}
