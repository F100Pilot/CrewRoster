import { useMemo } from 'react';
import { Box, Card, CardContent, LinearProgress, Tooltip, Typography } from '@mui/material';
import { Timer } from '@mui/icons-material';
import { cumulativeFlightTime, FTL_LIMITS } from '../domain/flightTime';
import { formatDuration } from '../utils/duration';
import type { ParsedDuty } from '../domain/types';

// Accumulated flight time against the EASA FTL caps, ending today. A trailing-to-date
// view of what's already been flown — indicative, since it depends on the full
// duty history being present in the roster.
const ROWS: { key: keyof typeof FTL_LIMITS; label: string }[] = [
  { key: 'days28', label: '28 dias' },
  { key: 'months12', label: '12 meses' },
  { key: 'calendarYear', label: 'Ano civil' },
];

function barColor(pct: number): 'success' | 'warning' | 'error' {
  if (pct >= 90) return 'error';
  if (pct >= 75) return 'warning';
  return 'success';
}

export default function FtlCard({ duties }: { duties: ParsedDuty[] }) {
  const totals = useMemo(
    () => cumulativeFlightTime(duties, new Date().toISOString().slice(0, 10)),
    [duties]
  );

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <Timer fontSize="small" color="action" />
          <Typography variant="subtitle2">Tempo de voo acumulado</Typography>
          <Tooltip title="Limites EASA, até hoje. Indicativo — depende do histórico importado.">
            <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
              EASA
            </Typography>
          </Tooltip>
        </Box>

        <Box>
          {ROWS.map(({ key, label }) => {
            const used = totals[key];
            const limit = FTL_LIMITS[key];
            const pct = Math.min(100, Math.round((used / limit) * 100));
            return (
              <Box key={key} sx={{ mb: 1 }}>
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
          })}
        </Box>
      </CardContent>
    </Card>
  );
}
