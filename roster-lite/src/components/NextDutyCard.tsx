import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { FlightTakeoff } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import type { ParsedDuty } from '../domain/types';
import { countdownTo, utcDateTime } from '../utils/duration';
import { toLocalTime } from '../utils/localTime';

// The instant a duty "starts" for countdown purposes: check-in, else departure, else
// the start of the day. Used to pick and rank the next upcoming duty.
function startInstant(d: ParsedDuty): Date {
  return utcDateTime(d.date, d.reportingTime ?? d.departureTime ?? '00:00');
}

// Picks the soonest duty that has not yet ended (today's in-progress duty still shows).
function nextDuty(duties: ParsedDuty[], now: Date): ParsedDuty | null {
  const today = format(now, 'yyyy-MM-dd');
  const upcoming = duties
    .filter((d) => d.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : startInstant(a).getTime() - startInstant(b).getTime()));
  // Prefer the first duty whose start is still in the future…
  const future = upcoming.find((d) => startInstant(d).getTime() >= now.getTime());
  // …otherwise fall back to today's first duty (already started but still relevant).
  return future ?? upcoming.find((d) => d.date === today) ?? null;
}

export default function NextDutyCard({ duties }: { duties: ParsedDuty[] }) {
  const navigate = useNavigate();
  const now = new Date();
  const duty = nextDuty(duties, now);
  if (!duty) return null;

  const checkIn = duty.reportingTime;
  const counts = checkIn ? countdownTo(utcDateTime(duty.date, checkIn), now) : countdownTo(startInstant(duty), now);
  const lt = checkIn ? toLocalTime(duty.date, checkIn, duty.departureAirport) : null;
  const isToday = duty.date === format(now, 'yyyy-MM-dd');

  return (
    <Card
      onClick={() => navigate(`/day/${duty.date}`)}
      sx={{ cursor: 'pointer', bgcolor: 'primary.main', color: 'primary.contrastText' }}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
          <Typography variant="overline" sx={{ opacity: 0.8, lineHeight: 1 }}>
            {isToday ? 'Hoje' : 'Próximo serviço'}
          </Typography>
          {counts && (
            <Chip
              size="small"
              label={`em ${counts}`}
              sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: 'inherit', fontWeight: 700 }}
            />
          )}
        </Box>
        <Box display="flex" alignItems="center" gap={1}>
          <FlightTakeoff />
          <Box flexGrow={1}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {duty.flightNumber
                ? `${duty.flightNumber} · ${duty.departureAirport ?? ''}-${duty.arrivalAirport ?? ''}`
                : `${duty.dutyCode} · ${duty.dutyType}`}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ opacity: 0.9 }}>
              <Typography variant="body2">{format(parseISO(duty.date), 'EEE, dd MMM')}</Typography>
              {checkIn && (
                <Typography variant="body2" fontWeight={700}>
                  · Check-in {checkIn}z{lt ? ` (${lt} LT)` : ''}
                </Typography>
              )}
            </Stack>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
