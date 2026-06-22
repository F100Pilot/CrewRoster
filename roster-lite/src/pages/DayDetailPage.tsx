import { Box, Card, CardContent, Chip, Divider, IconButton, Stack, Typography } from '@mui/material';
import { ArrowBack, ChevronLeft, ChevronRight, FlightLand, FlightTakeoff, Hotel, IosShare, Phone } from '@mui/icons-material';
import { Link } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { dutyColor } from '../theme';
import { toLocalTime, toUserTime, userTimeZoneLabel } from '../utils/localTime';
import { diffMinutes, formatDuration } from '../utils/duration';
import { dayStats } from '../domain/dutyStats';
import { restBefore } from '../domain/restPeriods';
import { shareDayImage } from '../utils/shareDay';
import FlightWeather from '../components/FlightWeather';
import FlightInfo from '../components/FlightInfo';

export default function DayDetailPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const { roster, activeUser } = useRoster();

  const duties = (roster?.duties ?? []).filter((d) => d.date === date);
  const stats = dayStats(duties);
  const rest = date ? restBefore(roster?.duties ?? [], date) : null;

  // Adjacent days with entries, so swiping (or the header arrows) flips through the
  // roster without landing on empty days.
  const allDates = useMemo(
    () => Array.from(new Set((roster?.duties ?? []).map((d) => d.date))).sort(),
    [roster],
  );
  const idx = date ? allDates.indexOf(date) : -1;
  const prevDate = idx > 0 ? allDates[idx - 1] : null;
  const nextDate = idx >= 0 && idx < allDates.length - 1 ? allDates[idx + 1] : null;
  // replace:true keeps the back button returning to the list rather than walking back
  // through every day swiped to.
  const goTo = (d: string | null) => { if (d) navigate(`/day/${d}`, { replace: true }); };

  // Horizontal swipe to change day: left → next, right → previous. Ignores mostly-
  // vertical drags so it never fights the page scroll.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goTo(nextDate);
    else goTo(prevDate);
  };

  return (
    <Stack spacing={2} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <Box display="flex" alignItems="center" gap={0.5}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBack />
        </IconButton>
        <IconButton size="small" onClick={() => goTo(prevDate)} disabled={!prevDate} title="Dia anterior">
          <ChevronLeft />
        </IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {date ? format(parseISO(date), 'EEE, dd MMM yyyy') : ''}
        </Typography>
        <IconButton size="small" onClick={() => goTo(nextDate)} disabled={!nextDate} title="Dia seguinte">
          <ChevronRight />
        </IconButton>
        {date && duties.length > 0 && (
          <IconButton
            color="primary"
            title="Partilhar este dia"
            onClick={() => shareDayImage(date, duties, activeUser?.name)}
          >
            <IosShare />
          </IconButton>
        )}
      </Box>

      {(stats || (rest && rest.restMinutes !== null)) && (
        <Box display="flex" gap={1} flexWrap="wrap">
          {stats && (
            <>
              <Chip size="small" color="primary" variant="outlined" label={`Bloco ${formatDuration(stats.blockMinutes)}`} />
              <Chip size="small" variant="outlined" label={`Serviço ${formatDuration(stats.dutyMinutes)}`} />
            </>
          )}
          {rest && rest.restMinutes !== null && (
            <Chip
              size="small"
              variant={rest.short ? 'filled' : 'outlined'}
              color={rest.short ? 'warning' : 'default'}
              label={`Descanso ${formatDuration(rest.restMinutes)}`}
              sx={rest.short ? { color: '#fff' } : undefined}
            />
          )}
        </Box>
      )}

      {duties.length === 0 && <Typography color="text.secondary">Sem registos neste dia.</Typography>}

      {duties.map((duty, i) => (
        <Card key={i} variant="outlined">
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2} flexWrap="wrap">
              <Chip
                label={duty.dutyCode}
                sx={{
                  bgcolor: dutyColor(duty.dutyType),
                  color: duty.dutyType === 'Day Off' ? 'text.primary' : '#fff',
                  fontWeight: 700,
                }}
              />
              <Chip label={duty.dutyType} variant="outlined" size="small" />
              {duty.reportingTime && (
                <Chip
                  label={
                    `Check-in ${duty.reportingTime}z` +
                    (toLocalTime(date, duty.reportingTime, duty.departureAirport)
                      ? ` · ${toLocalTime(date, duty.reportingTime, duty.departureAirport)} LT`
                      : '')
                  }
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
            </Box>

            {duty.flightNumber && (
              <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, mb: 2 }}>
                <Box textAlign="center" mb={1}>
                  <Typography variant="caption" color="text.secondary">
                    Voo
                  </Typography>
                  <Typography variant="h6" fontWeight={700}>
                    {duty.flightNumber}
                  </Typography>
                </Box>
                <Box display="flex" alignItems="flex-start" justifyContent="center" gap={2}>
                  <TimePoint
                    airport={duty.departureAirport}
                    utc={duty.departureTime}
                    lt={toLocalTime(date, duty.departureTime, duty.departureAirport)}
                    userTime={toUserTime(date, duty.departureTime)}
                    label="STD"
                  />
                  <Box display="flex" alignItems="center" mt={1}>
                    <FlightTakeoff sx={{ color: 'primary.main' }} />
                    <Box sx={{ width: 32, height: 2, bgcolor: 'primary.main', mx: 0.5 }} />
                    <FlightLand sx={{ color: 'primary.main' }} />
                  </Box>
                  <TimePoint
                    airport={duty.arrivalAirport}
                    utc={duty.arrivalTime}
                    lt={toLocalTime(date, duty.arrivalTime, duty.arrivalAirport)}
                    userTime={toUserTime(date, duty.arrivalTime)}
                    label="STA"
                  />
                </Box>
                {(duty.aircraftType || (duty.departureTime && duty.arrivalTime)) && (
                  <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={1}>
                    {[duty.aircraftType, duty.departureTime && duty.arrivalTime
                      ? `Bloco ${formatDuration(diffMinutes(duty.departureTime, duty.arrivalTime))}`
                      : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Typography>
                )}
                {duty.hotel && <HotelLine hotel={duty.hotel} />}
              </Box>
            )}

            {/* Layover hotel on a non-flight day (e.g. a day off mid-rotation). */}
            {!duty.flightNumber && duty.hotel && (
              <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 1.5, mb: 2 }}>
                <HotelLine hotel={duty.hotel} />
              </Box>
            )}

            {duty.flightNumber && date && <FlightInfo duty={duty} date={date} />}

            {duty.flightNumber && date && <FlightWeather duty={duty} date={date} />}

            {(duty.dutyType === 'Training' || duty.dutyType === 'Simulator') &&
              (duty.departureTime || duty.arrivalTime) && (
                <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, mb: 2 }}>
                  <Box display="flex" justifyContent="space-around">
                    <Box textAlign="center">
                      <Typography variant="body2" fontWeight={600} color="primary.main">
                        {duty.departureTime || '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Início (UTC)
                      </Typography>
                    </Box>
                    <Box textAlign="center">
                      <Typography variant="body2" fontWeight={600} color="primary.main">
                        {duty.arrivalTime || '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Fim (UTC)
                      </Typography>
                    </Box>
                  </Box>
                  {duty.departureAirport && (
                    <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={1}>
                      {duty.departureAirport}
                    </Typography>
                  )}
                </Box>
              )}

            {duty.observations && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="body2" color="text.secondary">
                  {duty.observations}
                </Typography>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

// Layover hotel for a duty: name plus a tap-to-call phone number. Shown in the flight
// banner (and on a layover day off), resolved from the roster's "Hn" hotel markers.
function HotelLine({ hotel }: { hotel: { name: string; phone: string | null } }) {
  return (
    <Box display="flex" alignItems="center" justifyContent="center" gap={0.75} mt={1.25} flexWrap="wrap">
      <Hotel fontSize="small" sx={{ color: 'text.secondary' }} />
      <Typography variant="body2" fontWeight={600}>
        {hotel.name}
      </Typography>
      {hotel.phone && (
        <Link
          href={`tel:${hotel.phone.replace(/\s+/g, '')}`}
          underline="hover"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, ml: 0.5 }}
        >
          <Phone fontSize="inherit" />
          <Typography variant="body2" component="span">
            {hotel.phone}
          </Typography>
        </Link>
      )}
    </Box>
  );
}

// One endpoint of a flight: airport code, UTC time, local airport time, and — when
// the user is in a different timezone — the time in their own (device) timezone.
function TimePoint({
  airport,
  utc,
  lt,
  userTime,
  label,
}: {
  airport: string | null;
  utc: string | null;
  lt: string | null;
  userTime: string | null;
  label: string;
}) {
  // Only worth showing the user's own time when it differs from the airport's local
  // time (i.e. the user isn't in the same timezone as this airport).
  const showUser = userTime && userTime !== lt;
  return (
    <Box textAlign="center" minWidth={64}>
      <Typography variant="h5" fontWeight={700}>
        {airport || '—'}
      </Typography>
      <Typography variant="body2" fontWeight={600} color="primary.main">
        {utc || '—'}
        <Typography component="span" variant="body2" fontWeight={700} color="text.secondary">
          {' z'}
        </Typography>
      </Typography>
      {lt && (
        <Typography variant="caption" color="text.secondary" display="block">
          ({lt} LT)
        </Typography>
      )}
      {showUser && (
        <Typography variant="caption" color="text.secondary" display="block">
          ({userTime} {userTimeZoneLabel()})
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
    </Box>
  );
}
