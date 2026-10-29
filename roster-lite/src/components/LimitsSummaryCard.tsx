import { useMemo } from 'react';
import { Box, Card, CardActionArea, CardContent, Typography } from '@mui/material';
import { ChevronRight, Timer } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { limitLevel, limitRows, tightestRow } from '../domain/limitRows';
import { aeCompliance } from '../domain/aeCompliance';
import { formatDuration } from '../utils/duration';
import type { CrewRole, ParsedDuty } from '../domain/types';

// One line on the roster page standing in for the limits and compliance cards, which live on
// their own page: the bar closest to its limit, and how many agreement rules need a look. The
// colour follows the worst of the two, so a problem still shows without opening anything.
export default function LimitsSummaryCard({ duties, role }: { duties: ParsedDuty[]; role: CrewRole }) {
  const navigate = useNavigate();
  const pilot = role !== 'cabin';
  const { tight, warnings } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      tight: tightestRow(limitRows(duties, role, today)),
      warnings: pilot ? aeCompliance(duties, today).filter((c) => c.status === 'warn').length : 0,
    };
  }, [duties, role, pilot]);

  const level = tight ? limitLevel(tight.used, tight.limit) : 'success';
  const tone = level === 'error' ? 'error.main' : level === 'warning' || warnings ? 'warning.main' : 'success.main';
  const pct = tight ? Math.round((tight.used / tight.limit) * 100) : 0;

  return (
    <Card variant="outlined" sx={{ borderLeft: 4, borderLeftColor: tone }}>
      <CardActionArea onClick={() => navigate('/limites')}>
        <CardContent sx={{ py: 1, '&:last-child': { pb: 1 }, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Timer fontSize="small" color="action" />
          <Box flexGrow={1} minWidth={0}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {pilot ? 'Limites e AE' : 'Limites EASA'}
              {pilot && (
                <Typography component="span" variant="caption" fontWeight={700} color={warnings ? 'warning.main' : 'success.main'}>
                  {' · '}{warnings ? `${warnings} a verificar` : 'tudo conforme'}
                </Typography>
              )}
            </Typography>
            {tight && (
              <Typography variant="caption" color="text.secondary" display="block" noWrap>
                {tight.group} {tight.label.replace(' (pico)', '')}: {formatDuration(tight.used)} / {formatDuration(tight.limit)} ({pct}%)
              </Typography>
            )}
          </Box>
          <ChevronRight color="action" />
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
