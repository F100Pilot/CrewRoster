import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Card, CardContent, Chip, Divider, LinearProgress, Stack, Typography } from '@mui/material';

import { useRoster } from '../state/useRoster';
import { loadLogbook } from '../storage/rosterStore';
import { logbookStats } from '../domain/logbook';
import { blockByDate, activeYears, groundActivityByDate } from '../domain/activity';
import YearHeatmap from '../components/YearHeatmap';
import MonthlyChart, { type Measure } from '../components/MonthlyChart';
import { dutyByYear, monthlyTotals } from '../domain/monthlyTotals';
import { dutyRulesFor } from '../domain/dutyTime';
import { todayISO } from '../domain/rosterWindow';
import { formatDuration } from '../utils/duration';
import type { LogbookRow } from '../domain/types';
import PageHero from '../components/PageHero';

export default function StatsPage() {
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
  const role = activeUser?.role;
  const months = useMemo(
    () => monthlyTotals(rows, roster?.duties ?? [], dutyRulesFor(role), todayISO()),
    [rows, roster, role],
  );
  // The chart's Bloco / Serviço toggle also switches the yearly totals (user, 0.9.3.64).
  const [measure, setMeasure] = useState<Measure>('block');
  const dutyYears = useMemo(() => dutyByYear(roster?.duties ?? [], dutyRulesFor(role)), [roster, role]);

  return (
    <Stack spacing={2}>
      <PageHero
        back label="Estatísticas"
        title={rows.length ? formatDuration(stats.blockMinutes) : 'Estatísticas'}
        subtitle={rows.length ? 'de bloco no diário' : undefined}
        stats={rows.length ? [
          { label: 'Setores', value: String(stats.sectors) },
          { label: 'Aeroportos', value: String(stats.airports) },
          { label: 'Aeronaves', value: String(stats.tails) },
        ] : undefined}
      />


      {rows.length === 0 ? (
        <Alert severity="info">
          Sem voos no diário ainda. Importa a escala e as estatísticas aparecem aqui.
        </Alert>
      ) : (
        <>

          <MonthlyChart months={months} measure={measure} onMeasureChange={setMeasure} />

          {/* Per year */}
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle2" gutterBottom>Por ano · {measure === 'block' ? 'bloco' : 'serviço'}</Typography>
              <Stack divider={<Divider flexItem />} spacing={0.75}>
                {stats.byYear.map((y) => {
                  const d = dutyYears.get(String(y.year));
                  return (
                    <Box key={y.year} display="flex" alignItems="center" gap={1}>
                      <Typography variant="body2" sx={{ width: 48, fontWeight: 600 }}>{y.year}</Typography>
                      <Typography variant="body2" sx={{ flexGrow: 1 }} color="text.secondary">
                        {measure === 'block'
                          ? `${y.sectors} setores`
                          : d ? `${d.days} dias de serviço${d.months < 12 ? ` · ${d.months} ${d.months === 1 ? 'mês' : 'meses'} com escala` : ''}` : 'sem escala guardada'}
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {measure === 'block' ? formatDuration(y.blockMinutes) : d ? formatDuration(d.minutes) : '—'}
                      </Typography>
                    </Box>
                  );
                })}
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

