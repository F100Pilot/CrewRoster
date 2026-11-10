import { Alert, Box, Card, CardContent, Chip, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight, FlightLand, FlightTakeoff, Groups, Hotel, IosShare, Phone, WbSunny, Bedtime, Brightness4 } from '@mui/icons-material';
import { Link } from '@mui/material';
import { addDays, format, parseISO } from 'date-fns';
import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { dutyColor } from '../theme';
import { toLocalTime, checkInTimeLabel } from '../utils/localTime';
import { diffMinutes, formatDuration } from '../utils/duration';
import { baseOf, dayStats } from '../domain/dutyStats';
import { restBefore } from '../domain/restPeriods';
import { workWindow, PGA_PILOT_RULES } from '../domain/dutyTime';
import { fdpForDay, type FdpInfo } from '../domain/fdp';
import { dutyTags, type DutyTag } from '../domain/aeCompliance';
import { LATE_MINUTES } from '../domain/planVsFlown';
import { MARK_LABEL, isInstructorMark, splitMarks } from '../domain/dutyMarks';
import { AE_DISCLAIMER } from '../components/AeDisclaimer';
import { sectorSun } from '../domain/sectorSun';
import { shareDayImage } from '../utils/shareDay';
import type { ParsedDuty } from '../domain/types';
import FlightWeather from '../components/FlightWeather';
import FlightInfo from '../components/FlightInfo';
import FlicStand from '../components/FlicStand';
import { dayLabel } from '../utils/dates';
import { dutyTypeLabel } from '../domain/dutyLabels';
import PageHero from '../components/PageHero';
import RaacoDayCard from '../components/RaacoDayCard';
import { PASS_MONO, PassCells, passOverline } from '../components/PassCard';
import { localClock } from '../utils/localTime';
import { utcDateTime } from '../utils/duration';

export default function DayDetailPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const { roster, activeUser } = useRoster();

  const location = useLocation();
  const duties = (roster?.duties ?? []).filter((d) => d.date === date);
  const stats = dayStats(duties);
  // Pilots are measured against the company agreement (RUPT); cabin crew keep the generic rules.
  const pilot = (activeUser?.role ?? 'pilot') === 'pilot';
  const base = baseOf(activeUser);
  const rest = date ? restBefore(roster?.duties ?? [], date, pilot ? 'pilot' : 'cabin', base) : null;
  // On duty until 30 min after the last on-blocks (RUPT cl. 6, def. 42) — the figure the limits use.
  const dutyMinutes = stats && pilot && date
    ? workWindow(date, duties, PGA_PILOT_RULES)?.span ?? stats.dutyMinutes
    : stats?.dutyMinutes;
  const fdp = pilot && duties.length ? fdpForDay(duties, rest, base) : null;
  const tags = pilot && date ? dutyTags(date, duties) : [];

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
      <PageHero
        back label={duties.length ? dutyTypeLabel(duties[0].dutyType) : 'Dia'}
        title={date ? dayLabel(date, true) : ''}
        subtitle={daySummary(duties)}
        stats={stats ? [
          { label: 'Bloco', value: formatDuration(stats.blockMinutes) },
          { label: 'Serviço', value: formatDuration(dutyMinutes ?? stats.dutyMinutes) },
        ] : undefined}
        actions={
          <>
            <IconButton size="small" onClick={() => goTo(prevDate)} disabled={!prevDate} aria-label="Dia anterior"><ChevronLeft /></IconButton>
            <IconButton size="small" onClick={() => goTo(nextDate)} disabled={!nextDate} aria-label="Dia seguinte"><ChevronRight /></IconButton>
            {date && duties.length > 0 && (
              <IconButton size="small" aria-label="Partilhar este dia" onClick={() => shareDayImage(date, duties, activeUser?.name)}><IosShare /></IconButton>
            )}
          </>
        }
      />

      {(fdp || tags.length > 0 || (rest && rest.restMinutes !== null)) && (
        <Box display="flex" gap={1} flexWrap="wrap">
          {fdp && <FdpChip fdp={fdp} />}
          {tags.map((t) => <TagChip key={t} tag={t} />)}
          {rest && rest.restMinutes !== null && (
            <Tooltip
              title={pilot
                ? `Mínimo ${formatDuration(rest.requiredMinutes)} (RUPT cl. 25/34): ${rest.away ? '10h fora da base' : '12h na base'}, ` +
                  'ou a duração do serviço anterior se for maior; +2h se esse serviço tocou as 02:00–05:59 de Lisboa. ' +
                  `Irregularidades e a autoridade do comandante podem reduzi-lo. ${AE_DISCLAIMER}`
                : 'Indicativo: abaixo de 12h.'}
            >
              <Chip
                size="small"
                variant={rest.short ? 'filled' : 'outlined'}
                color={rest.short ? 'warning' : 'default'}
                label={rest.short && pilot
                  ? `Descanso ${formatDuration(rest.restMinutes)} · mín ${formatDuration(rest.requiredMinutes)}`
                  : `Descanso ${formatDuration(rest.restMinutes)}`}
                sx={rest.short ? { color: '#fff' } : undefined}
              />
            </Tooltip>
          )}
        </Box>
      )}

      {duties.find((d) => d.dayWarning) && (
        <Alert severity="warning" variant="outlined" sx={{ py: 0.5 }}>
          {duties.find((d) => d.dayWarning)!.dayWarning}
        </Alert>
      )}

      {duties.length === 0 && <Typography color="text.secondary">Sem registos neste dia.</Typography>}

      {duties.map((duty, i) => (
        <Card
          key={i}
          variant="outlined"
          ref={(el: HTMLDivElement | null) => { cardRefs.current[i] = el; }}
          sx={{ overflow: 'hidden', ...(i === focusIdx ? { borderColor: 'primary.main', borderWidth: 2 } : {}) }}
        >
          {/* The "Hoje" pass header: the duty's colour on a strip, what it is on the small line. */}
          <Box sx={{ height: 6, bgcolor: dutyColor(duty.dutyType) }} />
          <CardContent>
            <Box display="flex" alignItems="baseline" gap={1} mb={duty.flightNumber ? 1.5 : 0.5} flexWrap="wrap">
              <Typography component="div" sx={{ ...passOverline, flexGrow: 1 }}>
                {dutyTypeLabel(duty.dutyType).toUpperCase()}{duty.flightNumber ? ` · ${duty.dutyCode}` : ''}
              </Typography>
              {duty.reportingTime && duty.flightNumber && (
                <Typography sx={{ ...passOverline, color: 'primary.main' }}>
                  APRES. {checkInTimeLabel(date, duty.reportingTime, duty.departureAirport)}
                </Typography>
              )}
            </Box>
            {!duty.flightNumber && (
              <Typography sx={{ fontFamily: PASS_MONO, fontSize: '1.7rem', fontWeight: 800, lineHeight: 1.2, mb: 1.5, wordBreak: 'break-word' }}>
                {duty.dutyCode}
              </Typography>
            )}

            {duty.flightNumber && (
              <Box sx={{ bgcolor: 'rgba(128,128,128,0.14)', borderRadius: 2, p: 2, mb: 2 }}>
                <Box textAlign="center" mb={1}>
                  <Typography variant="caption" color="text.secondary">
                    Voo
                  </Typography>
                  <Typography variant="h6" fontWeight={700}>
                    {duty.flightNumber}
                  </Typography>
                  {duty.observations && <MarkChips text={duty.observations} center />}
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
                <PlannedLine duty={duty} date={date} />
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

            {/* Ground duties with times (training, simulator, office, standby…): the "Hoje" pass row. */}
            {!duty.flightNumber && date && <GroundTimes duty={duty} date={date} place={duty.departureAirport ?? baseOf(activeUser)} />}

            {['Training', 'Simulator', 'Office Duty', 'Medical'].includes(duty.dutyType) && duty.crew && duty.crew.length > 0 && (
                <Box sx={{ bgcolor: 'rgba(128,128,128,0.14)', borderRadius: 2, p: 2, mb: 2 }}>
                  {duty.crew && duty.crew.length > 0 && (
                    <GroundCrew crew={duty.crew} myCode={activeUser?.crewCode} />
                  )}
                </Box>
              )}

            {duty.observations && <Observations text={duty.observations} marksShown={!!duty.flightNumber} />}
          </CardContent>
        </Card>
      ))}

      {date && <RaacoDayCard date={date} />}
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
          <Box key={i} sx={{ flex: 1, bgcolor: day ? '#ffb300' : '#1E2A55' }} />
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

// The crew rostered on a simulator (or training) session, from the PDF's "Crew Information on
// Ground Activity" section. Compact list, tap a name to see all shared flights — like the flight
// banner's crew popover. The user's own entry is hidden (they know they're on it).
const GROUND_ROLE_LABEL: Record<string, string> = { CP: 'Comandante', FO: 'Oficial Piloto', PU: 'Chefe de Cabine', ST: 'Tripulante' };
function GroundCrew({ crew, myCode }: { crew: NonNullable<ParsedDuty['crew']>; myCode?: string }) {
  const navigate = useNavigate();
  const code = myCode?.trim().toUpperCase() || null;
  const others = crew.filter((c) => !code || c.login.toUpperCase() !== code);
  if (others.length === 0) return null;
  return (
    <Box mt={1.25}>
      <Box display="flex" alignItems="center" justifyContent="center" gap={0.5} mb={0.5}>
        <Groups fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="caption" color="text.secondary">Tripulação escalada</Typography>
      </Box>
      <Stack spacing={0.25} alignItems="center">
        {others.map((c) => (
          <Link
            key={c.login}
            component="button"
            underline="hover"
            onClick={() => navigate(`/crew/${c.login}`)}
            sx={{ typography: 'body2', color: 'text.primary' }}
          >
            {c.firstName ? `${c.firstName} ${c.surname}` : c.surname}
            <Typography component="span" variant="caption" color="text.secondary">
              {' · '}{GROUND_ROLE_LABEL[c.role] ?? c.role}
            </Typography>
          </Link>
        ))}
      </Stack>
    </Box>
  );
}

// The day's flight duty period against its maximum (RUPT cl. 35). Red once over, amber within
// 30 min of it, otherwise a quiet outline — it's the number to glance at when a day runs late.
function FdpChip({ fdp }: { fdp: FdpInfo }) {
  const margin = fdp.max - fdp.planned;
  const over = margin < 0;
  const tight = !over && margin <= 30;
  const why = fdp.rule === 'night-away'
    ? 'Apresentação fora da base entre as 22:00 e as 06:00: máximo de 6h, ou 9h com 16h de repouso antes, incluindo uma noite local (cl. 35.3).'
    : `Tabela da cl. 35.1 para apresentação às ${fdp.reportLocal} (Lisboa) e ${fdp.sectors} ${fdp.sectors === 1 ? 'setor' : 'setores'}.`;
  const extra = fdp.beyondTable ? ' Mais de 4 setores: o AE só planeia até 4 aterragens (cl. 15.12); usado o limite legal.' : '';
  return (
    <Tooltip title={`PSV da apresentação aos calços do último setor. ${why}${extra} ${AE_DISCLAIMER}`}>
      <Chip
        size="small"
        variant={over || tight ? 'filled' : 'outlined'}
        color={over ? 'error' : tight ? 'warning' : 'default'}
        label={`FDP ${formatDuration(fdp.planned)} / máx ${formatDuration(fdp.max)}`}
        sx={over || tight ? { color: '#fff' } : undefined}
      />
    </Tooltip>
  );
}


// Early Start / Late Finish / Night Duty (RUPT def. 14, 19, 22; cl. 22.7), in base time.
const TAG_INFO: Record<DutyTag, { label: string; why: string }> = {
  ES: { label: 'Early Start', why: 'Apresentação entre as 05:00 e as 06:29 (hora da base).' },
  LF: { label: 'Late Finish', why: 'Fim do serviço entre as 00:00 e as 01:59 (hora da base).' },
  ND: { label: 'Night Duty', why: 'Serviço que toca o período das 02:00 às 04:59 (hora da base).' },
};

function TagChip({ tag }: { tag: DutyTag }) {
  const info = TAG_INFO[tag];
  return (
    <Tooltip title={`${info.why} No máximo 2 seguidos e 3 entre períodos de folga (RUPT cl. 22). ${AE_DISCLAIMER}`}>
      <Chip size="small" variant="outlined" color="secondary" label={info.label} />
    </Tooltip>
  );
}

// The plan a flown sector replaced (kept when the roster was synced after the day), so the day
// reads "planned 08:00 → 09:00, arrived +25". Nothing when it went as planned.
function PlannedLine({ duty, date }: { duty: ParsedDuty; date: string | undefined }) {
  const p = duty.planned;
  if (!p?.departureTime || !p.arrivalTime || !duty.arrivalTime) return null;
  if (p.departureTime === duty.departureTime && p.arrivalTime === duty.arrivalTime) return null;
  const offLt = date ? toLocalTime(date, p.departureTime, duty.departureAirport) : null;
  const onLt = date ? toLocalTime(date, p.arrivalTime, duty.arrivalAirport) : null;
  const delta = ((diffMinutes(p.arrivalTime, duty.arrivalTime) + 720) % 1440) - 720;
  const late = delta >= LATE_MINUTES;
  return (
    <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={0.25}>
      Planeado {offLt && onLt ? `${offLt} → ${onLt} LT` : `${p.departureTime} → ${p.arrivalTime} z`}
      {delta !== 0 && (
        <Box component="span" fontWeight={700} color={late ? 'warning.main' : 'text.secondary'}>
          {' · chegada '}{delta > 0 ? '+' : '−'}{formatDuration(Math.abs(delta))}
        </Box>
      )}
    </Typography>
  );
}

function MarkChips({ text, center }: { text: string; center?: boolean }) {
  const { marks } = splitMarks(text);
  if (marks.length === 0) return null;
  return (
    <Box display="flex" flexWrap="wrap" gap={0.5} justifyContent={center ? 'center' : 'flex-start'} mt={center ? 0.5 : 0}>
      {marks.map((m) => (
        <Chip key={m} size="small" variant="outlined" color={isInstructorMark(m) ? 'primary' : 'default'} label={MARK_LABEL[m]} />
      ))}
    </Box>
  );
}

// A duty's observations: known marks as chips (unless the flight banner already shows them),
// anything else as plain text.
function Observations({ text, marksShown }: { text: string; marksShown?: boolean }) {
  const { marks, rest } = splitMarks(text);
  if (!rest && (marksShown || marks.length === 0)) return null;
  return (
    <>
      <Divider sx={{ my: 1.5 }} />
      {!marksShown && marks.length > 0 && <Box mb={rest ? 0.75 : 0}><MarkChips text={text} /></Box>}
      {rest && <Typography variant="body2" color="text.secondary">{rest}</Typography>}
    </>
  );
}

// One endpoint of a flight: airport code, the airport's local time (what the crew reads
// off the clock at the gate) and the UTC time in brackets underneath. When we don't know
// the airport's timezone there's no local time to lead with, so UTC takes the top line.
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
        {lt || utc || '—'}
        <Typography component="span" variant="body2" fontWeight={700} color="text.secondary">
          {lt ? ' LT' : ' z'}
        </Typography>
      </Typography>
      {lt && utc && (
        <Typography variant="caption" color="text.secondary" display="block">
          ({utc} z)
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
    </Box>
  );
}

// The day in one line for the banner: its route, or what it is.
function daySummary(duties: ParsedDuty[]): string | undefined {
  const legs = duties.filter((d) => (d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning') && d.departureAirport);
  if (legs.length) return `${[legs[0].departureAirport, ...legs.map((l) => l.arrivalAirport)].join(' → ')} · ${legs.length} ${legs.length === 1 ? 'setor' : 'setores'}`;
  return duties[0] ? `${dutyTypeLabel(duties[0].dutyType)} · ${duties[0].dutyCode}` : undefined;
}

// Start, end, span and place of a ground duty, as the dashed row of a "Hoje" pass.
function GroundTimes({ duty, date, place }: { duty: ParsedDuty; date: string; place: string }) {
  const s = duty.reportingTime ?? duty.departureTime;
  if (!s && !duty.arrivalTime) return null;
  const start = s ? utcDateTime(date, s) : null;
  let end = duty.arrivalTime ? utcDateTime(date, duty.arrivalTime) : null;
  if (start && end && end < start) end = new Date(end.getTime() + 86_400_000);
  const span = start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;
  return (
    <Box sx={{ mx: -2, mb: 0.5 }}>
      <PassCells cells={[
        { label: 'INÍCIO', value: start ? localClock(start, place) : '—' },
        { label: 'FIM', value: end ? localClock(end, place) : '—' },
        { label: 'DURAÇÃO', value: span !== null ? formatDuration(span) : '—' },
        { label: 'LOCAL', value: place },
      ]} />
    </Box>
  );
}
