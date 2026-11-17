import { useMemo } from 'react';
import { Box } from '@mui/material';
import { StatTile } from './PassCard';
import { baseOf, timedFlights, nightsAwayFromBase, freeDayCounts } from '../domain/dutyStats';
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

// Tier 2 — at-a-glance monthly totals: block time, flights, duty days, standby, nights away, then folgas / PLS / holidays.
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
    // Folgas, PLS and holidays apart (a tester, Nov 2026), each by day.
    const free = freeDayCounts(duties);
    const standby = duties.filter((d) => d.dutyType.startsWith('Standby') || d.dutyType === 'Reserve').length;
    const nightsAway = nightsAwayFromBase(duties, base);

    return [
      { value: formatDuration(blockMinutes), label: 'Bloco' },
      { value: String(flights.length), label: 'Voos' },
      { value: String(dutyDays), label: 'Serviço' },
      { value: String(standby), label: 'Assist.' },
      { value: String(nightsAway), label: 'Fora' },
      { value: String(free.folga), label: 'Folgas' },
      { value: String(free.pls), label: 'PLS' },
      { value: String(free.ferias), label: 'Férias' },
    ];
  }, [duties, base]);

  // Tiles in the "Hoje" style (small label, big number), four to a row on a phone (two rows: the work, then nights away and the days free), centred
  // (user: the month's tiles read better with the text in the middle).
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', sm: 'repeat(8, minmax(0, 1fr))' }, gap: 1 }}>
      {stats.map((s) => <StatTile key={s.label} center label={s.label.toUpperCase()} value={s.value} />)}
    </Box>
  );
}
