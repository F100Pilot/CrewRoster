import { useMemo } from 'react';
import { Box, Card, CardContent, LinearProgress, Tooltip, Typography } from '@mui/material';
import { Timer } from '@mui/icons-material';
import { aeFlightTime, cumulativeFlightTime, peak28FlightTime, AE_FLIGHT_LIMITS, FTL_LIMITS } from '../domain/flightTime';
import { aeDutyTime, peakDutyTime, AE_DUTY_LIMITS, DUTY_LIMITS, EASA_RULES } from '../domain/dutyTime';
import { formatDuration } from '../utils/duration';
import { format, parseISO } from 'date-fns';
import type { CrewRole, ParsedDuty } from '../domain/types';

// Red only once the limit is actually exceeded — a bar at 90% that already read red looked like
// a breach; amber from 90% as the heads-up; green below.
function barColor(used: number, limit: number): 'success' | 'warning' | 'error' {
  if (used > limit) return 'error';
  if (used >= limit * 0.9) return 'warning';
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
              color={barColor(used, limit)}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>
        );
        return note ? <Tooltip key={label} title={note}>{bar}</Tooltip> : <Box key={label}>{bar}</Box>;
      })}
    </Box>
  );
}

const AE_TOOLTIP =
  'Limites do Acordo de Empresa SIPLA (RUPT). Tempo de voo, cl. 30: 90h em 4 semanas, 270h por trimestre, ' +
  '850h por ano — o simulador também conta. Tempo de trabalho, cl. 31: 50h em 7 dias, 180h em 28, 480h por ' +
  'trimestre, 1800h por ano. O serviço vai da apresentação até 30 min depois dos calços; assistência em casa ' +
  'conta 25%, no aeroporto 50%, a reserva de 24h não conta. As barras de pico são a pior janela da escala, ' +
  'dias futuros incluídos; o trimestre é o mais pesado a partir do atual. Indicativo: depende do histórico importado.';

const EASA_TOOLTIP =
  'Tempo de voo e tempo de serviço do ORO.FTL.210. As barras de pico são a pior janela de dias consecutivos da ' +
  'escala, incluindo dias futuros. O serviço conta da apresentação à última chegada; um dia só de reserva em casa ' +
  'conta a 25%, a percentagem habitual — a tua companhia pode usar outra. Indicativo: depende do histórico importado.';

// Flight time and duty against their caps. Pilots are measured against the Portugália / SIPLA
// company agreement (RUPT cl. 30–31), stricter than EASA on every window; cabin crew against the
// EASA ORO.FTL figures, as the SIPLA agreement covers pilots only. Every "pico" bar is the WORST
// window of consecutive days anywhere in the roster (future included) — the actual test ("any N
// consecutive days"), so it warns before a breach instead of after. Indicative — it depends on
// the imported history being complete.
export default function FtlCard({ duties, role = 'pilot' }: { duties: ParsedDuty[]; role?: CrewRole }) {
  const today = new Date().toISOString().slice(0, 10);
  const pilot = role !== 'cabin';
  const { flightRows, dutyRows } = useMemo(() => {
    if (pilot) {
      const f = aeFlightTime(duties, today);
      const d = aeDutyTime(duties, today);
      const quarterNote = (label: string | null) => (label ? `Trimestre mais pesado: ${label}` : undefined);
      return {
        flightRows: [
          { label: '4 semanas (pico)', used: f.days28.minutes, limit: AE_FLIGHT_LIMITS.days28, note: peakNote(f.days28.endDate, 28) },
          { label: 'Trimestre (pico)', used: f.quarter.minutes, limit: AE_FLIGHT_LIMITS.quarter, note: quarterNote(f.quarter.label) },
          { label: 'Ano (52 semanas)', used: f.year, limit: AE_FLIGHT_LIMITS.year },
        ] as Row[],
        dutyRows: [
          { label: '7 dias (pico)', used: d.days7.minutes, limit: AE_DUTY_LIMITS.days7, note: peakNote(d.days7.endDate, 7) },
          { label: '28 dias (pico)', used: d.days28.minutes, limit: AE_DUTY_LIMITS.days28, note: peakNote(d.days28.endDate, 28) },
          { label: 'Trimestre (pico)', used: d.quarter.minutes, limit: AE_DUTY_LIMITS.quarter, note: quarterNote(d.quarter.label) },
          { label: 'Ano (52 semanas)', used: d.year, limit: AE_DUTY_LIMITS.year },
        ] as Row[],
      };
    }
    const totals = cumulativeFlightTime(duties, today);
    const peak = peak28FlightTime(duties);
    const duty = peakDutyTime(duties, EASA_RULES);
    return {
      flightRows: [
        { label: '28 dias (pico)', used: peak.minutes, limit: FTL_LIMITS.days28, note: peakNote(peak.endDate, 28) },
        { label: '12 meses (até hoje)', used: totals.months12, limit: FTL_LIMITS.months12 },
        { label: 'Ano civil (até hoje)', used: totals.calendarYear, limit: FTL_LIMITS.calendarYear },
      ] as Row[],
      dutyRows: [
        { label: '7 dias (pico)', used: duty.days7.minutes, limit: DUTY_LIMITS.days7, note: peakNote(duty.days7.endDate, 7) },
        { label: '14 dias (pico)', used: duty.days14.minutes, limit: DUTY_LIMITS.days14, note: peakNote(duty.days14.endDate, 14) },
        { label: '28 dias (pico)', used: duty.days28.minutes, limit: DUTY_LIMITS.days28, note: peakNote(duty.days28.endDate, 28) },
      ] as Row[],
    };
  }, [duties, pilot, today]);

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <Timer fontSize="small" color="action" />
          <Typography variant="subtitle2">{pilot ? 'Limites AE' : 'Limites EASA'}</Typography>
          <Tooltip title={pilot ? AE_TOOLTIP : EASA_TOOLTIP}>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              {pilot ? 'RUPT' : 'EASA'}
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
