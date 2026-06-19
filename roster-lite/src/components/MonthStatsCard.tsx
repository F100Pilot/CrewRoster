import { useMemo } from 'react';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { Flight, AccessTime, EventBusy, WorkHistory, Today as TodayIcon } from '@mui/icons-material';
import { timedFlights } from '../domain/dutyStats';
import { diffMinutes, formatDuration } from '../utils/duration';
import type { ParsedDuty } from '../domain/types';

interface Props {
  duties: ParsedDuty[]; // already filtered to the visible month
}

interface Stat {
  icon: React.ReactNode;
  value: string;
  label: string;
}

// Tier 2 — at-a-glance monthly totals: block time, flights, duty days, off days, standby.
export default function MonthStatsCard({ duties }: Props) {
  const stats = useMemo<Stat[]>(() => {
    const flights = timedFlights(duties);
    const blockMinutes = flights.reduce(
      (sum, f) => sum + diffMinutes(f.departureTime!, f.arrivalTime!),
      0
    );
    const dutyDays = new Set(
      duties.filter((d) => d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning').map((d) => d.date)
    ).size;
    const offDays = duties.filter((d) => d.dutyType === 'Day Off' || d.dutyType === 'Vacation').length;
    const standby = duties.filter((d) => d.dutyType.startsWith('Standby') || d.dutyType === 'Reserve').length;

    return [
      { icon: <AccessTime fontSize="small" />, value: formatDuration(blockMinutes), label: 'Bloco' },
      { icon: <Flight fontSize="small" />, value: String(flights.length), label: 'Voos' },
      { icon: <TodayIcon fontSize="small" />, value: String(dutyDays), label: 'Serviço' },
      { icon: <WorkHistory fontSize="small" />, value: String(standby), label: 'Standby' },
      { icon: <EventBusy fontSize="small" />, value: String(offDays), label: 'Folgas' },
    ];
  }, [duties]);

  return (
    <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 1,
          }}
        >
          {stats.map((s) => (
            <Stack key={s.label} alignItems="center" spacing={0.25} sx={{ minWidth: 0 }}>
              <Box sx={{ color: 'primary.main', display: 'flex' }}>{s.icon}</Box>
              <Typography variant="subtitle2" fontWeight={700} noWrap>
                {s.value}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {s.label}
              </Typography>
            </Stack>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
