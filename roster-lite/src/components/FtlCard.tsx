import { useMemo } from 'react';
import { Box, Card, CardContent, LinearProgress, Tooltip, Typography } from '@mui/material';
import { Timer } from '@mui/icons-material';
import { cumulativeFlightTime, peak28FlightTime, FTL_LIMITS } from '../domain/flightTime';
import { formatDuration } from '../utils/duration';
import { format, parseISO } from 'date-fns';
import type { ParsedDuty } from '../domain/types';

function barColor(pct: number): 'success' | 'warning' | 'error' {
  if (pct >= 90) return 'error';
  if (pct >= 75) return 'warning';
  return 'success';
}

// Flight time against the EASA FTL caps. The 28-day bar shows the WORST 28-consecutive-day
// window across the whole roster (including future-rostered flights) — that is the actual
// EASA test, so it warns before a breach. The 12-month / calendar-year bars are
// trailing-to-today. Indicative — depends on the imported history being complete.
export default function FtlCard({ duties }: { duties: ParsedDuty[] }) {
  const { totals, peak } = useMemo(() => ({
    totals: cumulativeFlightTime(duties, new Date().toISOString().slice(0, 10)),
    peak: peak28FlightTime(duties),
  }), [duties]);

  const rows: { label: string; used: number; limit: number; note?: string }[] = [
    {
      label: '28 dias (pico)',
      used: peak.minutes,
      limit: FTL_LIMITS.days28,
      note: peak.endDate ? `Pior janela de 28 dias até ${format(parseISO(peak.endDate), 'dd/MM')}` : undefined,
    },
    { label: '12 meses (até hoje)', used: totals.months12, limit: FTL_LIMITS.months12 },
    { label: 'Ano civil (até hoje)', used: totals.calendarYear, limit: FTL_LIMITS.calendarYear },
  ];

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <Timer fontSize="small" color="action" />
          <Typography variant="subtitle2">Tempo de voo</Typography>
          <Tooltip title="Limites EASA. A barra de 28 dias é o pico de qualquer janela de 28 dias consecutivos (inclui escala futura). Indicativo — depende do histórico importado.">
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              EASA
            </Typography>
          </Tooltip>
        </Box>

        <Box>
          {rows.map(({ label, used, limit, note }) => {
            const pct = Math.min(100, Math.round((used / limit) * 100));
            const bar = (
              <Box sx={{ mb: 1 }}>
                <Box display="flex" justifyContent="space-between" mb={0.25}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography variant="caption" fontWeight={600}>
                    {formatDuration(used)} / {formatDuration(limit)}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={pct}
                  color={barColor(pct)}
                  sx={{ height: 6, borderRadius: 3 }}
                />
              </Box>
            );
            return note ? (
              <Tooltip key={label} title={note}>{bar}</Tooltip>
            ) : (
              <Box key={label}>{bar}</Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}
