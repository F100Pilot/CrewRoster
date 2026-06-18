import { Chip } from '@mui/material';
import type { ParsedDuty } from '../domain/types';
import { dutyColor } from '../theme';

// A compact chip summarising a duty: flight number + route, or the duty code.
export default function DutyChip({ duty, dense = false }: { duty: ParsedDuty; dense?: boolean }) {
  const label = duty.flightNumber
    ? `${duty.flightNumber}${duty.departureAirport ? ` ${duty.departureAirport}-${duty.arrivalAirport ?? ''}` : ''}`
    : duty.dutyCode;
  const bg = dutyColor(duty.dutyType);
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        bgcolor: bg,
        color: duty.dutyType === 'Day Off' ? 'text.primary' : '#fff',
        fontWeight: 600,
        fontSize: dense ? '0.6rem' : '0.72rem',
        height: dense ? 18 : 24,
        width: dense ? '100%' : 'auto',
        '& .MuiChip-label': { px: dense ? 0.5 : 1 },
      }}
    />
  );
}
