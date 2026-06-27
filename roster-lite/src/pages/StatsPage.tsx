import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Card, CardContent, Chip, Divider, IconButton, LinearProgress, Stack, Typography,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { loadLogbook } from '../storage/rosterStore';
import { logbookStats } from '../domain/logbook';
import { blockByDate, activeYears, groundActivityByDate } from '../domain/activity';
import YearHeatmap from '../components/YearHeatmap';
import { formatDuration } from '../utils/duration';
import type { LogbookRow } from '../domain/types';

export default function StatsPage() {
  const navigate = useNavigate();
  const { activeUser, roster } = useRoster();
  const userId = activeUser?.id;

  const [rows, setRows] = useState<LogbookRow[]>([]);
  const reload = useCallback(async () => {
    setRows(userId ? await loadLogbook(userId) : []);
  }, [userId]);
  useEffect(() => { reload(); }, [reload]);
  // The roster provider syncs the logbook in the background; refresh when it lands.
  useEffect(() => {
    window.addEventListener('logbook-updated', reload);
    return () => window.removeEventListener('logbook-updated', reload);
  }, [reload]);

  const stats = useMemo(() => logbookStats(rows), [rows]);
  const maxAircraft = Math.max(1, ...stats.byAircraft.map((a) => a.sectors));
  const minutesByDate = useMemo(() => blockByDate(rows), [rows]);
  const groundByDate = useMemo(() => groundActivityByDate(roster?.duties ?? []), [roster]);
  const years = useMemo(() => activeYears(rows, groundByDate.keys()), [rows, groundByDate]);

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" gap={1}>
        <IconButton onClick={() => navigate(-1)}><ArrowBack /></IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Estatísticas</Typography>
      </Box>

      {rows.length === 0 ? (
        <Alert severity="info">
          Sem voos no diário ainda. Importa a escala e as estatísticas aparecem aqui.
        </Alert>
      ) : (
        <>
          {/* Headline totals */}
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
                <Tile value={formatDuration(stats.blockMinutes)} label="Bloco" />
                <Tile value={String(stats.sectors)} label="Setores" />
                <Tile value={String(stats.airports)} label="Aeroportos" />
                <Tile value={String(stats.tails)} label="Aeronaves" />
              </Box>
            </CardContent>
          </Card>

          {/* Per year */}
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle2" gutterBottom>Por ano</Typography>
              <Stack divider={<Divider flexItem />} spacing={0.75}>
                {stats.byYear.map((y) => (
                  <Box key={y.year} display="flex" alignItems="center" gap={1}>
                    <Typography variant="body2" sx={{ width: 48, fontWeight: 600 }}>{y.year}</Typography>
                    <Typography variant="body2" sx={{ flexGrow: 1 }} color="text.secondary">
                      {y.sectors} setores
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>{formatDuration(y.blockMinutes)}</Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>

          {/* Activity heatmap per year */}
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle2" gutterBottom>Atividade</Typography>
              <Stack spacing={1.5}>
                {years.map((y) => (
                  <Box key={y}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{y}</Typography>
                    <YearHeatmap year={y} minutesByDate={minutesByDate} groundByDate={groundByDate} />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>

          {/* Top airports */}
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle2" gutterBottom>Aeroportos mais visitados</Typography>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {stats.topAirports.map((a) => (
                  <Chip key={a.code} size="small" label={`${a.code} · ${a.visits}`} />
                ))}
              </Box>
            </CardContent>
          </Card>

          {/* Aircraft type distribution */}
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle2" gutterBottom>Por aeronave</Typography>
              <Stack spacing={1}>
                {stats.byAircraft.map((a) => (
                  <Box key={a.type}>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2">{a.type}</Typography>
                      <Typography variant="body2" color="text.secondary">{a.sectors}</Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={(a.sectors / maxAircraft) * 100}
                      sx={{ borderRadius: 1, height: 6 }}
                    />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <Stack alignItems="center" spacing={0.25} sx={{ minWidth: 0 }}>
      <Typography variant="subtitle1" fontWeight={700} noWrap>{value}</Typography>
      <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
    </Stack>
  );
}
