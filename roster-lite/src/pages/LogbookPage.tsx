import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider, IconButton, LinearProgress, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import { Add, ArrowBack, Download, Edit, ExpandLess, ExpandMore, FlightTakeoff, Print, Sync } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { logbookCsvRows, landingsInRows, mergeLogbook, rowBlock, rowNight, sortLogbook } from '../domain/logbook';
import { backfillRegs, pendingBackfillCount, regMap, type BackfillResult } from '../domain/aircraftRegs';
import { loadLogbook, putLogbookRows, deleteLogbookRow } from '../storage/rosterStore';
import { getAeroDataBoxKey } from '../storage/settings';
import type { LogbookRow } from '../domain/types';
import { formatDuration } from '../utils/duration';
import { downloadBlob } from '../utils/download';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import LogbookEditDialog, { type LogbookEditResult } from '../components/LogbookEditDialog';

// Recency requirement: 3 take-offs and landings in the preceding 90 days.
const RECENCY_REQUIRED = 3;
const RECENCY_DAYS = 90;

// Restore the persisted set of collapsed month keys for a user.
function loadCollapsed(key: string | null): Set<string> {
  if (!key) return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]') as string[]); } catch { return new Set(); }
}

export default function LogbookPage() {
  const navigate = useNavigate();
  const { roster, activeUser } = useRoster();

  // Memoised so the effects below don't re-run on every render (a fresh [] each time).
  const duties = useMemo(() => roster?.duties ?? [], [roster]);
  const userId = activeUser?.id;
  const today = new Date().toISOString().slice(0, 10);

  // The permanent logbook lives in its own store, so it survives clearing the roster.
  const [rows, setRows] = useState<LogbookRow[]>([]);
  const reload = useCallback(async () => {
    if (!userId) { setRows([]); return; }
    setRows(sortLogbook(await loadLogbook(userId)));
  }, [userId]);
  useEffect(() => { reload(); }, [reload]);

  // Merge the current roster into the permanent logbook: new sectors are added (and
  // reordered by date), non-edited rows refreshed, hand-edited rows left untouched.
  useEffect(() => {
    if (!userId || duties.length === 0) return;
    let alive = true;
    (async () => {
      const [existing, regs] = await Promise.all([loadLogbook(userId), regMap(userId)]);
      const upserts = mergeLogbook(existing, duties, userId, regs);
      if (upserts.length && alive) {
        await putLogbookRows(upserts);
        await reload();
      }
    })();
    return () => { alive = false; };
  }, [userId, duties, reload]);

  const entries = useMemo(() => sortLogbook(rows), [rows]);
  // Group sectors by calendar month for a month-by-month logbook, each with its own
  // sector count and block subtotal.
  // Night minutes per row, computed once (one sun calc per sector) and reused for totals/display.
  const nightByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.key, rowNight(e));
    return m;
  }, [entries]);

  const monthGroups = useMemo(() => {
    const groups: { key: string; label: string; rows: LogbookRow[]; block: number; night: number }[] = [];
    for (const e of entries) {
      const mk = e.date.slice(0, 7); // YYYY-MM
      let g = groups[groups.length - 1];
      if (!g || g.key !== mk) {
        const name = format(parseISO(e.date), 'MMMM yyyy', { locale: pt });
        g = { key: mk, label: name.charAt(0).toUpperCase() + name.slice(1), rows: [], block: 0, night: 0 };
        groups.push(g);
      }
      g.rows.push(e);
      g.block += rowBlock(e);
      g.night += nightByKey.get(e.key) ?? 0;
    }
    return groups;
  }, [entries, nightByKey]);

  // Collapsible months: a set of collapsed month keys, persisted per user so the chosen
  // layout (which months are folded) survives navigation and reloads.
  const collapseKey = userId ? `crewroster.logbook.collapsed.${userId}` : null;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsed(collapseKey));
  useEffect(() => { setCollapsed(loadCollapsed(collapseKey)); }, [collapseKey]);
  const toggleMonth = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    if (collapseKey) {
      try { localStorage.setItem(collapseKey, JSON.stringify([...next])); } catch { /* ignore */ }
    }
    return next;
  });
  const totalBlock = useMemo(() => entries.reduce((sum, r) => sum + rowBlock(r), 0), [entries]);
  const totalNight = useMemo(() => [...nightByKey.values()].reduce((s, n) => s + n, 0), [nightByKey]);
  const landings90 = useMemo(() => landingsInRows(entries, today, RECENCY_DAYS), [entries, today]);
  const recencyOk = landings90 >= RECENCY_REQUIRED;
  const missingRegs = useMemo(
    () => entries.filter((e) => !e.reg && e.date <= today).length, [entries, today]);

  // ── Backfill past registrations from AeroDataBox ──────────────────────────────────
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; found: number } | null>(null);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!userId || duties.length === 0) { setPendingCount(null); return; }
    pendingBackfillCount(userId, duties).then(setPendingCount);
  }, [userId, duties, rows]);

  async function runBackfill() {
    if (!userId || running) return;
    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: 0, found: 0 });
    cancelRef.current = false;
    try {
      const r = await backfillRegs(userId, duties, setProgress, () => cancelRef.current);
      setResult(r);
      // Flow the freshly-captured (and inferred) tails into the permanent logbook.
      const [existing, regs] = await Promise.all([loadLogbook(userId), regMap(userId)]);
      await putLogbookRows(mergeLogbook(existing, duties, userId, regs));
    } finally {
      setRunning(false);
      setProgress(null);
      await reload();
    }
  }

  function exportCsv() {
    const blob = new Blob([logbookCsvRows(entries)], { type: 'text/csv;charset=utf-8' });
    const who = activeUser?.name?.replace(/\s+/g, '-').toLowerCase() ?? 'crew';
    downloadBlob(blob, `logbook-${who}.csv`);
  }

  // ── Manual edit / add / delete ─────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<LogbookRow | null>(null);

  function openAdd() { setEditing(null); setEditOpen(true); }
  function openEdit(row: LogbookRow) { setEditing(row); setEditOpen(true); }

  async function handleSave({ row, previousKey }: LogbookEditResult) {
    if (previousKey) await deleteLogbookRow(previousKey); // route/date changed → re-file
    await putLogbookRows([row]);
    setEditOpen(false);
    await reload();
  }
  async function handleDelete(key: string) {
    await deleteLogbookRow(key);
    setEditOpen(false);
    await reload();
  }

  const hasKey = !!getAeroDataBoxKey();
  const backfillMsg = (r: BackfillResult): string => {
    const base = `${r.found} matrícula(s) registada(s).`;
    if (r.stopped === 'quota') return `${base} Limite mensal da API atingido — tenta mais tarde.`;
    if (r.stopped === 'auth') return 'Chave recusada (sem subscrição/acesso). Confirma a chave e a subscrição AeroDataBox no RapidAPI.';
    if (r.stopped === 'not_configured') return 'Define a chave AeroDataBox nas Definições (⚙️) primeiro.';
    if (r.stopped === 'cancelled') return `${base} Cancelado.`;
    if (r.found === 0 && r.emptyCount > 0)
      return 'Sem dados para estes voos. O plano gratuito da AeroDataBox normalmente não inclui voos antigos (só recentes/próximos).';
    return `${base} Concluído.`;
  };

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" gap={1}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Diário de bordo</Typography>
        <Button size="small" variant="outlined" startIcon={<Add />} onClick={openAdd}>
          Adicionar
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Download />}
          onClick={exportCsv}
          disabled={entries.length === 0}
        >
          CSV
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Print />}
          onClick={() => navigate('/logbook/print')}
          disabled={entries.length === 0}
        >
          EASA
        </Button>
      </Box>

      <Card variant="outlined">
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box display="flex" flexWrap="wrap" gap={1} alignItems="center">
            <FlightTakeoff fontSize="small" color="action" />
            <Chip size="small" variant="outlined" label={`${entries.length} setores`} />
            <Chip size="small" variant="outlined" label={`Bloco ${formatDuration(totalBlock)}`} />
            {totalNight > 0 && (
              <Chip size="small" variant="outlined" label={`Noite ${formatDuration(totalNight)}`} />
            )}
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

      {/* Backfill the aircraft registrations flown on past sectors (AeroDataBox). Needs a
          roster in memory (the API is queried by flight number + date). */}
      {duties.length > 0 && (
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="body2" sx={{ flexGrow: 1 }}>
                Matrículas em falta: {missingRegs}
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
            {/* Warn before the user spends quota — free tier: 100 req/month, 1 req/s. */}
            {!running && !result && hasKey && pendingCount != null && pendingCount > 0 && (
              <Alert severity="info" sx={{ mt: 1, py: 0, fontSize: '0.78rem' }}>
                Vai usar <strong>{pendingCount} pedido{pendingCount !== 1 ? 's' : ''}</strong> da API
                (plano gratuito: ~100/mês · 1/s). Duração ~{Math.ceil(pendingCount * 1.1)}s.
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
        <Alert severity="info">
          Sem setores no diário. Importa a escala (preenche-se sozinho) ou usa “Adicionar”.
        </Alert>
      ) : (
        <Card variant="outlined">
          {/* Compact layout: Voo+Rota and Avião+Matrícula stacked two-per-cell so the whole
              logbook fits a phone screen. Tap a row to edit it. */}
          <Table
            size="small"
            sx={{
              tableLayout: 'fixed',
              '& td, & th': { px: 1, verticalAlign: 'top', textAlign: 'center' },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '14%' }}>Data</TableCell>
                <TableCell>Voo / Rota</TableCell>
                <TableCell sx={{ width: '17%' }}>Bloco</TableCell>
                <TableCell sx={{ width: '27%' }}>Avião</TableCell>
                <TableCell sx={{ width: '9%' }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {monthGroups.map((g) => [
                <TableRow
                  key={`h-${g.key}`}
                  hover
                  sx={{ bgcolor: 'action.hover', cursor: 'pointer' }}
                  onClick={() => toggleMonth(g.key)}
                >
                  <TableCell
                    colSpan={5}
                    sx={{ textAlign: 'left !important', py: 0.5, fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                      {collapsed.has(g.key) ? <ExpandMore sx={{ fontSize: 18 }} /> : <ExpandLess sx={{ fontSize: 18 }} />}
                    </Box>
                    {g.label}
                    <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, ml: 1, fontSize: '0.8rem' }}>
                      · {g.rows.length} setor{g.rows.length !== 1 ? 'es' : ''} · {formatDuration(g.block)}{g.night > 0 ? ` · noite ${formatDuration(g.night)}` : ''}
                    </Box>
                  </TableCell>
                </TableRow>,
                ...(collapsed.has(g.key) ? [] : g.rows.map((e) => (
                  <TableRow key={e.key} hover sx={{ cursor: 'pointer' }} onClick={() => openEdit(e)}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{format(parseISO(e.date), 'dd/MM')}</TableCell>
                    <TableCell>
                      <Box sx={{ fontWeight: 600 }}>{e.flightNumber}{e.edited ? ' ✎' : ''}</Box>
                      <Box sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>{e.from}–{e.to}</Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box>{formatDuration(rowBlock(e))}</Box>
                      {(nightByKey.get(e.key) ?? 0) > 0 && (
                        <Box sx={{ color: '#5c6bc0', fontSize: '0.78rem' }}>🌙 {formatDuration(nightByKey.get(e.key)!)}</Box>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box>{e.aircraft || '—'}</Box>
                      <Box sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                        {e.reg || '—'}{e.reg && e.regInferred ? ' *' : ''}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ p: 0 }}>
                      <IconButton size="small" onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}>
                        <Edit sx={{ fontSize: 16 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))),
              ])}
            </TableBody>
          </Table>
        </Card>
      )}

      <Divider />
      <Typography variant="caption" color="text.secondary">
        Diário permanente (mantém-se mesmo ao limpar a escala). Não substitui o teu logbook oficial.
        {entries.some((e) => e.regInferred) && (
          <> Matrículas com <strong>*</strong> foram inferidas da rotação do dia (mesmo avião).</>
        )}
        {entries.some((e) => e.edited) && <> <strong>✎</strong> = editado à mão.</>}
      </Typography>

      {userId && (
        <LogbookEditDialog
          open={editOpen}
          userId={userId}
          initial={editing}
          onClose={() => setEditOpen(false)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </Stack>
  );
}
