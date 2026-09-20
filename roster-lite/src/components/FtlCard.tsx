import { useMemo } from 'react';
import { Box, Card, CardContent, LinearProgress, Tooltip, Typography } from '@mui/material';
import { Timer } from '@mui/icons-material';
import { cumulativeFlightTime, peak28FlightTime, FTL_LIMITS } from '../domain/flightTime';
import { peakDutyTime, DUTY_LIMITS } from '../domain/dutyTime';
import { formatDuration } from '../utils/duration';
import { format, parseISO } from 'date-fns';
import type { ParsedDuty } from '../domain/types';

function barColor(pct: number): 'success' | 'warning' | 'error' {
  if (pct >= 90) return 'error';
  if (pct >= 75) return 'warning';
  return 'success';
}

interface Row { label: string; used: number; limit: number; note?: string }

function peakNote(endDate: string | null, days: number): string | undefined {
  return endDate ? `Pior janela de ${days} dias até ${format(parseISO(endDate), 'dd/MM')}` : undefined;
}

// One labelled group of limit bars (flight time, or duty).
function LimitGroup({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <Box>
      <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={0.5}>
        {title}
      </Typography>
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
        return note ? <Tooltip key={label} title={note}>{bar}</Tooltip> : <Box key={label}>{bar}</Box>;
      })}
    </Box>
  );
}

// Flight time and duty against the EASA FTL caps. Every "pico" bar is the WORST window of
// consecutive days anywhere in the roster (future included) — that is the actual EASA test
// ("any N consecutive days"), so it warns before a breach instead of after. The 12-month
// and calendar-year flight-time bars are trailing-to-today. Indicative — it depends on the
// imported history being complete, and on how the operator counts home standby.
export default function FtlCard({ duties }: { duties: ParsedDuty[] }) {
  const { totals, peak, duty } = useMemo(() => ({
    totals: cumulativeFlightTime(duties, new Date().toISOString().slice(0, 10)),
    peak: peak28FlightTime(duties),
    duty: peakDutyTime(duties),
  }), [duties]);

  const flightRows: Row[] = [
    { label: '28 dias (pico)', used: peak.minutes, limit: FTL_LIMITS.days28, note: peakNote(peak.endDate, 28) },
    { label: '12 meses (até hoje)', used: totals.months12, limit: FTL_LIMITS.months12 },
    { label: 'Ano civil (até hoje)', used: totals.calendarYear, limit: FTL_LIMITS.calendarYear },
  ];

  const dutyRows: Row[] = [
    { label: '7 dias (pico)', used: duty.days7.minutes, limit: DUTY_LIMITS.days7, note: peakNote(duty.days7.endDate, 7) },
    { label: '14 dias (pico)', used: duty.days14.minutes, limit: DUTY_LIMITS.days14, note: peakNote(duty.days14.endDate, 14) },
    { label: '28 dias (pico)', used: duty.days28.minutes, limit: DUTY_LIMITS.days28, note: peakNote(duty.days28.endDate, 28) },
  ];

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <Timer fontSize="small" color="action" />
          <Typography variant="subtitle2">Limites EASA</Typography>
          <Tooltip title="Tempo de voo e tempo de serviço do ORO.FTL.210. As barras de pico são a pior janela de dias consecutivos da escala, incluindo dias futuros. O serviço conta da apresentação à última chegada; um dia só de reserva em casa conta a 25%, a percentagem habitual — a tua companhia pode usar outra. Indicativo: depende do histórico importado.">
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              EASA
            </Typography>
          </Tooltip>
        </Box>

        <Box
          display="grid"
          gap={{ xs: 0.5, sm: 2 }}
          gridTemplateColumns={{ xs: '1fr', sm: '1fr 1fr' }}
        >
          <LimitGroup title="Tempo de voo" rows={flightRows} />
          <LimitGroup title="Serviço" rows={dutyRows} />
        </Box>
      </CardContent>
    </Card>
  );
}
