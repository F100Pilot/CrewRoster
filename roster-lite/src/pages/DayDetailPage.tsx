import { Box, Card, CardContent, Chip, Divider, IconButton, Stack, Typography } from '@mui/material';
import { ArrowBack, ChevronLeft, ChevronRight, FlightLand, FlightTakeoff, Hotel, IosShare, Phone, WbSunny, Bedtime, Brightness4 } from '@mui/icons-material';
import { Link } from '@mui/material';
import { addDays, format, parseISO } from 'date-fns';
import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { dutyColor } from '../theme';
import { toLocalTime } from '../utils/localTime';
import { diffMinutes, formatDuration } from '../utils/duration';
import { dayStats } from '../domain/dutyStats';
import { restBefore } from '../domain/restPeriods';
import { sectorSun } from '../domain/sectorSun';
import { shareDayImage } from '../utils/shareDay';
import type { ParsedDuty } from '../domain/types';
import FlightWeather from '../components/FlightWeather';
import FlightInfo from '../components/FlightInfo';
import FlicStand from '../components/FlicStand';

export default function DayDetailPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const { roster, activeUser } = useRoster();

  const location = useLocation();
  const duties = (roster?.duties ?? []).filter((d) => d.date === date);
  const stats = dayStats(duties);
  const rest = date ? restBefore(roster?.duties ?? [], date) : null;

  // When arriving from a specific flight (e.g. the "com quem voo" list), open ON that flight and
  // highlight it; otherwise open at the top. Re-runs when stepping to another day (arrows/swipe).
  const focus = location.state as { flightNumber?: string | null; dep?: string | null; arr?: string | null } | null;
  const focusIdx = focus?.flightNumber
    ? duties.findIndex((d) => d.flightNumber === focus.flightNumber
        && d.departureAirport === focus.dep && d.arrivalAirport === focus.arr)
    : -1;
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const el = focusIdx >= 0 ? cardRefs.current[focusIdx] : null;
    if (el) el.scrollIntoView({ block: 'center' });
    else window.scrollTo(0, 0);
  }, [date, focusIdx]);

  // Step one calendar day at a time within the roster's date span, so swiping (or the
  // header arrows) flows through every day — including empty ones — not just days with
  // entries.
  const range = useMemo(() => {
    const dates = (roster?.duties ?? []).map((d) => d.date).sort();
    return dates.length ? { min: dates[0], max: dates[dates.length - 1] } : null;
  }, [roster]);
  const shift = (iso: string, days: number) => format(addDays(parseISO(iso), days), 'yyyy-MM-dd');
  const prevDate = date && range && date > range.min ? shift(date, -1) : null;
  const nextDate = date && range && date < range.max ? shift(date, 1) : null;
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
        <Card
          key={i}
          variant="outlined"
          ref={(el: HTMLDivElement | null) => { cardRefs.current[i] = el; }}
          sx={i === focusIdx ? { borderColor: 'primary.main', borderWidth: 2 } : undefined}
        >
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
              <Box sx={{ bgcolor: 'rgba(128,128,128,0.14)', borderRadius: 2, p: 2, mb: 2 }}>
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
                <SunNightLine
                  duty={duty}
                  date={date}
                  trailing={
                    <FlicStand
                      flightNumber={duty.flightNumber}
                      dep={duty.departureAirport}
                      arr={duty.arrivalAirport}
                      date={date ?? null}
                    />
                  }
                />
                {duty.hotel && <HotelLine hotel={duty.hotel} />}
              </Box>
            )}

            {/* Layover hotel on a non-flight day (e.g. a day off mid-rotation). */}
            {!duty.flightNumber && duty.hotel && (
              <Box sx={{ bgcolor: 'rgba(128,128,128,0.14)', borderRadius: 2, p: 1.5, mb: 2 }}>
                <HotelLine hotel={duty.hotel} />
              </Box>
            )}

            {duty.flightNumber && date && <FlightInfo duty={duty} date={date} />}

            {duty.flightNumber && date && <FlightWeather duty={duty} date={date} />}

            {(duty.dutyType === 'Training' || duty.dutyType === 'Simulator') &&
              (duty.departureTime || duty.arrivalTime) && (
                <Box sx={{ bgcolor: 'rgba(128,128,128,0.14)', borderRadius: 2, p: 2, mb: 2 }}>
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

// Daylight / night for a sector, shown graphically: a bar mapping the flight (departure →
// arrival) coloured day (amber) vs night (indigo) from the sampled sun profile; a chip for the
// flight type; and a sunrise/sunset card per airport. Silent for non-network airports / no times.
function SunNightLine({ duty, date, trailing }: { duty: ParsedDuty; date: string | undefined; trailing?: React.ReactNode }) {
  const s = sectorSun(duty.departureAirport, duty.arrivalAirport, date ?? null, duty.departureTime, duty.arrivalTime);
  if (!s) return null;
  const dep = duty.departureAirport, arr = duty.arrivalAirport;
  const airports = [{ code: dep, t: s.depSun }, ...(arr && arr !== dep ? [{ code: arr, t: s.arrSun }] : [])];
  const chip = s.nightMin <= 0
    ? { icon: <WbSunny sx={{ color: '#ffb300 !important' }} />, label: 'Voo diurno' }
    : s.nightMin >= s.blockMin
      ? { icon: <Bedtime sx={{ color: '#5c6bc0 !important' }} />, label: 'Voo noturno' }
      : { icon: <Brightness4 sx={{ color: '#7e57c2 !important' }} />, label: `Diurno + ${formatDuration(s.nightMin)} de noite` };

  return (
    <Box mt={1.25}>
      {/* endpoints: departure ← bar → arrival */}
      <Box display="flex" justifyContent="space-between" mb={0.25}>
        <Typography variant="caption" color="text.secondary">{dep} · {duty.departureTime}z</Typography>
        <Typography variant="caption" color="text.secondary">{arr} · {duty.arrivalTime}z</Typography>
      </Box>
      {/* the day/night bar */}
      <Box sx={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
        {s.profile.map((day, i) => (
          <Box key={i} sx={{ flex: 1, bgcolor: day ? '#ffb300' : '#1a237e' }} />
        ))}
      </Box>
      <Box display="flex" justifyContent="center" mt={0.75}>
        <Chip size="small" variant="outlined" icon={chip.icon} label={chip.label} />
      </Box>
      {/* sunrise/sunset cards (+ caption) as one group, with any trailing card (the live FLIC
          stand) beside it on the right so the block stays compact rather than stacking */}
      <Box display="flex" gap={1} justifyContent="center" alignItems="flex-start" flexWrap="wrap" mt={0.75}>
        <Box>
          <Box display="flex" gap={1} justifyContent="center">
            {airports.map((ap) => (
              <Box key={ap.code} sx={{ px: 1.25, py: 0.5, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'center', minWidth: 118 }}>
                <Typography variant="caption" fontWeight={700} display="block">{ap.code}</Typography>
                <Box display="flex" gap={1.25} alignItems="center" justifyContent="center">
                  <Box display="flex" alignItems="center" gap={0.25}>
                    <WbSunny sx={{ fontSize: 15, color: '#ffb300' }} />
                    <Typography variant="caption">{ap.t.sunriseUtc ?? '—'}</Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={0.25}>
                    <Bedtime sx={{ fontSize: 14, color: '#5c6bc0' }} />
                    <Typography variant="caption">{ap.t.sunsetUtc ?? '—'}</Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={0.25} sx={{ opacity: 0.7 }}>
            Nascer / pôr do sol (UTC)
          </Typography>
        </Box>
        {trailing}
      </Box>
    </Box>
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

// One endpoint of a flight: airport code, UTC time, and the airport's local time.
function TimePoint({
  airport,
  utc,
  lt,
  label,
}: {
  airport: string | null;
  utc: string | null;
  lt: string | null;
  label: string;
}) {
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
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
    </Box>
  );
}
