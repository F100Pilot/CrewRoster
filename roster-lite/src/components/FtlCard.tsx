import { useMemo } from 'react';
import { Box, Card, CardContent, LinearProgress, Tooltip, Typography } from '@mui/material';
import { Timer } from '@mui/icons-material';
import { formatDuration } from '../utils/duration';
import { limitLevel, limitRows, type LimitRow } from '../domain/limitRows';
import type { CrewRole, ParsedDuty } from '../domain/types';
import { ExperimentalChip } from './AeDisclaimer';

// One labelled group of limit bars (flight time, or duty).
function LimitGroup({ title, rows }: { title: string; rows: LimitRow[] }) {
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
              color={limitLevel(used, limit)}
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
    const rows = limitRows(duties, role, today);
    return { flightRows: rows.filter((r) => r.group === 'Tempo de voo'), dutyRows: rows.filter((r) => r.group === 'Serviço') };
  }, [duties, role, today]);

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <Timer fontSize="small" color="action" />
          <Typography variant="subtitle2">{pilot ? 'Limites AE' : 'Limites EASA'}</Typography>
          {pilot && <ExperimentalChip />}
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
