import { useMemo } from 'react';
import { Box } from '@mui/material';
import { StatTile } from './PassCard';
import { baseOf, timedFlights, nightsAwayFromBase } from '../domain/dutyStats';
import { useRoster } from '../state/useRoster';
import { diffMinutes, formatDuration } from '../utils/duration';
import type { ParsedDuty } from '../domain/types';

interface Props {
  duties: ParsedDuty[]; // already filtered to the visible month
}

interface Stat {
  value: string;
  label: string;
}

// Tier 2 — at-a-glance monthly totals: block time, flights, duty days, off days, standby.
export default function MonthStatsCard({ duties }: Props) {
  // Nights away are counted from the profile's own base (Lisboa or Porto).
  const base = baseOf(useRoster().activeUser);
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
    const nightsAway = nightsAwayFromBase(duties, base);

    return [
      { value: formatDuration(blockMinutes), label: 'Bloco' },
      { value: String(flights.length), label: 'Voos' },
      { value: String(dutyDays), label: 'Serviço' },
      { value: String(standby), label: 'Standby' },
      { value: String(offDays), label: 'Folgas' },
      { value: String(nightsAway), label: 'Fora' },
    ];
  }, [duties, base]);

  // Tiles in the "Hoje" style (small label, big number), three to a row on a phone, centred
  // (user: the month's tiles read better with the text in the middle).
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(6, minmax(0, 1fr))' }, gap: 1 }}>
      {stats.map((s) => <StatTile key={s.label} center label={s.label.toUpperCase()} value={s.value} />)}
    </Box>
  );
}
