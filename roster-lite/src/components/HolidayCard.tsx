import { useMemo } from 'react';
import { Box, Card, CardContent, LinearProgress, Typography } from '@mui/material';
import { BeachAccess } from '@mui/icons-material';
import { holidayCount } from '../domain/aeCompliance';
import { ExperimentalChip } from './AeDisclaimer';
import type { ParsedDuty } from '../domain/types';

// Holiday days this year against the pilots' 42 (RUPT cl. 38), from the roster.
export default function HolidayCard({ duties }: { duties: ParsedDuty[] }) {
  const h = useMemo(() => holidayCount(duties, new Date().getFullYear()), [duties]);
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1} mb={0.75}>
          <BeachAccess fontSize="small" color="action" />
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Férias {h.year}</Typography>
          <ExperimentalChip />
        </Box>
        <Box display="flex" justifyContent="space-between" mb={0.25}>
          <Typography variant="caption" color="text.secondary">PLIC / SLIC / RLIC (dias de calendário)</Typography>
          <Typography variant="caption" fontWeight={600}>{h.calendarDays} / {h.entitlement}</Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min(100, Math.round((h.calendarDays / h.entitlement) * 100))}
          sx={{ height: 6, borderRadius: 3 }}
        />
        <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
          {h.carriedDays > 0 ? `Mais ${h.carriedDays} de F (férias em atraso, dias úteis). ` : ''}
          Gozadas e planeadas, tal como estão na escala importada (RUPT cl. 38).
        </Typography>
      </CardContent>
    </Card>
  );
}
