import { useEffect, useMemo, useState } from 'react';
import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { ChevronRight, FlightTakeoff, Login } from '@mui/icons-material';
import { alpha, createTheme, ThemeProvider } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { useColorMode } from '../state/colorMode';
import {
  accentFor, cityName, dayContext, dayDestination, legsOf, skyAt,
  type Accent, type DayContext, type Leg, type Phase, type Sky,
} from '../domain/dayPhase';
import { baseOf } from '../domain/dutyStats';
import { fdpForDay } from '../domain/fdp';
import { restBefore } from '../domain/restPeriods';
import { limitRows } from '../domain/limitRows';
import { createAppTheme, dutyColor } from '../theme';
import { formatDuration, utcDateTime } from '../utils/duration';
import { toLocalTime } from '../utils/localTime';
import { todayISO } from '../domain/rosterWindow';
import UploadDropzone from '../components/UploadDropzone';
import MetarTaf from '../components/MetarTaf';
import type { ParsedDuty } from '../domain/types';

// The home screen that changes with the crew member's day (from the approved "layout dinâmico"
// sketch). The header is the sky over the airport they're at — dawn, day, dusk or night from the
// real sunrise and sunset — and the whole page takes the phase's colours: night blue before a
// report, bright while on duty, deep teal on a layover, warm sand on a day off. Below it, always
// the whole day: the main item (a boarding pass for a flight, an activity pass for a simulator,
// course, office or standby), every duty of the day on a timeline, and the day's numbers. AE
// figures (FDP, rest minima) only for pilots.

interface Palette { dark: boolean; bg: string; card: string; fg: string; soft: string; line: string; accent: string }
const PALETTE: Record<Phase, { light: Palette; dark: Palette }> = {
  preflight: {
    light: { dark: true, bg: '#0A1222', card: '#131D33', fg: '#EAF0FA', soft: '#A6B5CE', line: '#24314D', accent: '#FFC56B' },
    dark: { dark: true, bg: '#0A1222', card: '#131D33', fg: '#EAF0FA', soft: '#A6B5CE', line: '#24314D', accent: '#FFC56B' },
  },
  duty: {
    light: { dark: false, bg: '#EEF3FA', card: '#FFFFFF', fg: '#101828', soft: '#475467', line: '#E1E7F0', accent: '#1F63B5' },
    dark: { dark: true, bg: '#0D1726', card: '#152238', fg: '#EAF0FA', soft: '#A6B5CE', line: '#24314D', accent: '#63A7EE' },
  },
  layover: {
    light: { dark: true, bg: '#071722', card: '#0E2A36', fg: '#E6F1F5', soft: '#A4C8D2', line: '#183E4C', accent: '#7EE0D2' },
    dark: { dark: true, bg: '#071722', card: '#0E2A36', fg: '#E6F1F5', soft: '#A4C8D2', line: '#183E4C', accent: '#7EE0D2' },
  },
  standby: {
    light: { dark: false, bg: '#FBF7F1', card: '#FFFFFF', fg: '#1F1A14', soft: '#65543F', line: '#EFE5D7', accent: '#B45309' },
    dark: { dark: true, bg: '#17130F', card: '#221C16', fg: '#F3ECE3', soft: '#BBAB96', line: '#342B22', accent: '#F59E0B' },
  },
  off: {
    light: { dark: false, bg: '#FBF7F1', card: '#FFFFFF', fg: '#1F1A14', soft: '#65543F', line: '#EFE5D7', accent: '#B45309' },
    dark: { dark: true, bg: '#17130F', card: '#221C16', fg: '#F3ECE3', soft: '#BBAB96', line: '#342B22', accent: '#F59E0B' },
  },
};
const SKY: Record<Sky, { bg: string; soft: string }> = {
  night: { bg: 'linear-gradient(180deg, #050D1C 0%, #0B2236 70%, #123247 100%)', soft: '#A9C3D3' },
  dawn: { bg: 'linear-gradient(180deg, #121A3A 0%, #2A2A5C 55%, #6B4258 85%, #A4614E 100%)', soft: '#E3D3DC' },
  day: { bg: 'linear-gradient(180deg, #164E96 0%, #1F63B5 55%, #2D74C4 100%)', soft: '#D6E6F8' },
  dusk: { bg: 'linear-gradient(180deg, #221C46 0%, #5A3560 60%, #8E4E4A 100%)', soft: '#EBD7D3' },
};
const DEST_ACCENT: Record<Exclude<Accent, 'base'>, string> = { islands: '#5EEAD4', south: '#FCD34D', north: '#93C5FD' };
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
const TYPE_LABEL: Record<string, string> = {
  'Flight Duty': 'Voo', Positioning: 'Posicionamento', 'Standby Airport': 'Assistência no aeroporto',
  'Standby Home': 'Assistência em casa', Reserve: 'Reserva', 'Office Duty': 'Gabinete', Training: 'Formação',
  Simulator: 'Simulador', Medical: 'Médico', Absence: 'Ausência', Vacation: 'Férias', 'Day Off': 'Folga', Other: 'Serviço',
};
const PHASE_LABEL: Record<Phase, string> = {
  preflight: 'Antes do serviço', duty: 'Em serviço', standby: 'Assistência', layover: 'Estadia', off: 'Folga',
};

const DAY = 86_400_000;
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const hhmmUtc = (d: Date) => d.toISOString().slice(11, 16);
// Local clock time at an airport for an instant, falling back to the device's clock.
function localAt(d: Date, airport: string | null | undefined): string {
  return toLocalTime(isoOf(d), hhmmUtc(d), airport) ?? d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}
function countdown(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m % 60}m`;
}
const weekday = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-PT', { weekday: 'short', timeZone: 'UTC' }).replace('.', '').slice(0, 3).toUpperCase();
const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayWord = (iso: string) => {
  const t = todayISO();
  if (iso === t) return 'hoje';
  if (iso === isoOf(new Date(Date.parse(`${t}T12:00:00Z`) + DAY))) return 'amanhã';
  return longDay(iso);
};

// One item of the day on the timeline: a leg, or any other duty with its own times.
interface Item { duty: ParsedDuty; start: Date | null; end: Date | null; place: string | null; leg: Leg | null }
function dayItems(date: string, duties: ParsedDuty[], base: string): Item[] {
  const legs = legsOf(date, duties);
  const items: Item[] = duties.map((d) => {
    const leg = legs.find((l) => l.duty === d) ?? null;
    if (leg) return { duty: d, start: leg.off, end: leg.on, place: d.departureAirport, leg };
    const s = d.reportingTime ?? d.departureTime;
    const start = s ? utcDateTime(date, s) : null;
    let end = d.arrivalTime ? utcDateTime(date, d.arrivalTime) : null;
    if (start && end && end < start) end = new Date(end.getTime() + DAY);
    return { duty: d, start, end, place: d.departureAirport ?? base, leg: null };
  });
  return items.sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));
}

export default function TodayPage() {
  const { roster, loading, activeUser } = useRoster();
  const { mode } = useColorMode();
  const navigate = useNavigate();
  // Re-read the clock every minute: countdowns, progress and the sky move on their own.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const pilot = activeUser?.role !== 'cabin';
  const base = baseOf(activeUser);
  const ctx = useMemo(() => (roster ? dayContext(roster.duties, now, base) : null), [roster, now, base]);
  const phase: Phase = ctx?.phase ?? 'off';
  const dest = ctx ? accentFor(dayDestination(ctx.legs, base) ?? (ctx.location !== base ? ctx.location : null), base) : 'base';
  const p: Palette = { ...PALETTE[phase][mode], ...(dest !== 'base' && PALETTE[phase][mode].dark ? { accent: DEST_ACCENT[dest] } : {}) };
  // The page carries its own palette; MUI pieces inside (METAR, buttons) follow it.
  const theme = useMemo(() => {
    const t = createAppTheme(p.dark ? 'dark' : 'light');
    return createTheme(t, {
      palette: { background: { default: p.bg, paper: p.card }, text: { primary: p.fg, secondary: p.soft }, divider: p.line, primary: { main: p.accent } },
    });
  }, [p.dark, p.bg, p.card, p.fg, p.soft, p.line, p.accent]);

  if (loading) return <Typography color="text.secondary">A carregar…</Typography>;
  if (!roster || !ctx) {
    return (
      <Stack spacing={2}>
        <UploadDropzone />
        <Box textAlign="center">
          <Button variant="outlined" startIcon={<Login />} onClick={() => navigate('/import')}>Importar escala</Button>
        </Box>
      </Stack>
    );
  }

  const sky = skyAt(ctx.location, now);
  return (
    <ThemeProvider theme={theme}>
      {/* Bleed to the screen edges and fill the height, so the phase colours are the page. */}
      <Box sx={{ mx: { xs: -2, sm: -3 }, mt: -2, mb: -2, bgcolor: p.bg, color: p.fg, minHeight: 'calc(100vh - 104px)', pb: 3 }}>
        <SkyHeader ctx={ctx} sky={sky.sky} sunrise={sky.sunrise} sunset={sky.sunset} accent={p.accent} base={base} />
        <Stack spacing={1.5} sx={{ px: 2, pt: 2 }}>
          <Body ctx={ctx} p={p} pilot={pilot} base={base} duties={roster.duties} />
        </Stack>
      </Box>
    </ThemeProvider>
  );
}

// ── Header: the sky ──

function SkyHeader({ ctx, sky, sunrise, sunset, accent, base }: {
  ctx: DayContext; sky: Sky; sunrise: Date | null; sunset: Date | null; accent: string; base: string;
}) {
  const c = SKY[sky];
  const sun = sky === 'night' || sky === 'dawn'
    ? sunrise && `Nascer do sol ${localAt(sunrise, ctx.location)}`
    : sunset && `Pôr do sol ${localAt(sunset, ctx.location)}`;
  const { over, big, under } = headline(ctx, base);
  return (
    <Box sx={{ background: c.bg, color: '#fff', px: 2.5, pt: 2, pb: 2.5, position: 'relative', overflow: 'hidden' }}>
      {sky === 'night' && <Stars />}
      <Box display="flex" alignItems="center" gap={1} position="relative">
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', color: c.soft }}>
          {ctx.location} · {localAt(ctx.now, ctx.location)} LT
        </Typography>
        <Box flexGrow={1} />
        {sun && <Typography sx={{ fontSize: '0.75rem', color: c.soft }}>{sun}</Typography>}
      </Box>
      <Box mt={1.5} position="relative">
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 26, px: 1.25, borderRadius: 13, bgcolor: accent, color: '#0B1222', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.05em' }}>
          {PHASE_LABEL[ctx.phase].toUpperCase()}
        </Box>
        <Typography sx={{ mt: 1, fontSize: '0.95rem', color: c.soft }}>{over}</Typography>
        <Typography sx={{ fontSize: '2.6rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{big}</Typography>
        {under && <Typography sx={{ mt: 0.5, fontSize: '0.85rem', color: c.soft }}>{under}</Typography>}
        {ctx.phase === 'duty' && ctx.currentLeg && <LegProgress leg={ctx.currentLeg} now={ctx.now} accent={accent} />}
      </Box>
    </Box>
  );
}

function Stars() {
  const pts = [[6, 14], [18, 40], [31, 9], [46, 30], [58, 12], [72, 44], [84, 18], [93, 36], [64, 70], [24, 76]];
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none' }}>
      {pts.map(([x, y], i) => (
        <Box key={i} sx={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: i % 3 ? 2 : 3, height: i % 3 ? 2 : 3, borderRadius: '50%', bgcolor: '#fff' }} />
      ))}
    </Box>
  );
}

// What the day looks like in one line, for the header.
function summary(ctx: DayContext): string | undefined {
  if (ctx.legs.length) {
    const route = [ctx.legs[0].duty.departureAirport, ...ctx.legs.map((l) => l.duty.arrivalAirport)].join(' → ');
    return `${route} · ${ctx.legs.length} ${ctx.legs.length === 1 ? 'setor' : 'setores'}`;
  }
  const d = ctx.duties.find((x) => x.dutyType !== 'Day Off');
  return d ? `${TYPE_LABEL[d.dutyType] ?? d.dutyType} · ${d.dutyCode}` : undefined;
}

function headline(ctx: DayContext, base: string): { over: string; big: string; under?: string } {
  const now = ctx.now.getTime();
  const first = ctx.legs[0];
  switch (ctx.phase) {
    case 'preflight': {
      const report = ctx.window!.start;
      return {
        over: `Apresentação ${dayWord(ctx.date!)} às ${localAt(report, first?.duty.departureAirport ?? ctx.location)}`,
        big: countdown(report.getTime() - now),
        under: summary(ctx),
      };
    }
    case 'duty': {
      const end = ctx.window!.end;
      if (ctx.currentLeg) {
        const l = ctx.currentLeg;
        return {
          over: `${l.duty.flightNumber ?? ''} · setor ${ctx.legs.indexOf(l) + 1} de ${ctx.legs.length}`,
          big: `${l.duty.departureAirport} → ${l.duty.arrivalAirport}`,
          under: `Chega às ${localAt(l.on, l.duty.arrivalAirport)} LT · faltam ${countdown(l.on.getTime() - now)}`,
        };
      }
      if (ctx.nextLeg) {
        return {
          over: `Em terra em ${cityName(ctx.location)} · próximo voo`,
          big: localAt(ctx.nextLeg.off, ctx.nextLeg.duty.departureAirport),
          under: `${ctx.nextLeg.duty.flightNumber ?? ''} para ${cityName(ctx.nextLeg.duty.arrivalAirport ?? '')} · daqui a ${countdown(ctx.nextLeg.off.getTime() - now)}`,
        };
      }
      return { over: 'Fim do serviço às', big: localAt(end, ctx.location), under: `daqui a ${countdown(end.getTime() - now)} · ${summary(ctx) ?? ''}` };
    }
    case 'standby': {
      const sby = ctx.duties.find((d) => d.dutyType.startsWith('Standby') || d.dutyType === 'Reserve');
      const live = ctx.window!.start.getTime() <= now;
      return live
        ? { over: `${sby?.dutyCode ?? 'Assistência'} · até às`, big: localAt(ctx.window!.end, base), under: `Faltam ${countdown(ctx.window!.end.getTime() - now)} · telefone ligado` }
        : { over: `${sby?.dutyCode ?? 'Assistência'} começa ${dayWord(ctx.date!)} às ${localAt(ctx.window!.start, base)}`, big: countdown(ctx.window!.start.getTime() - now) };
    }
    case 'layover':
      return {
        over: 'Estadia em',
        big: cityName(ctx.location),
        under: ctx.window ? `Apresentação ${dayWord(ctx.date!)} às ${localAt(ctx.window.start, ctx.location)} LT` : undefined,
      };
    case 'off':
    default:
      return ctx.window && ctx.date
        ? { over: 'Próximo serviço em', big: countdown(ctx.window.start.getTime() - now), under: `${longDay(ctx.date)} · ${summary(ctx) ?? ''}` }
        : { over: 'Folga', big: 'Descansa.', under: 'Sem serviços nos próximos dias.' };
  }
}

function LegProgress({ leg, now, accent }: { leg: Leg; now: Date; accent: string }) {
  const p = Math.min(1, Math.max(0, (now.getTime() - leg.off.getTime()) / (leg.on.getTime() - leg.off.getTime())));
  return (
    <Box mt={1.5} role="img" aria-label={`${Math.round(p * 100)}% do voo`} sx={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center' }}>
      <Box sx={{ flexGrow: 1, height: 3, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.3)' }}>
        <Box sx={{ width: `${p * 100}%`, height: 3, borderRadius: 2, bgcolor: accent }} />
      </Box>
      <FlightTakeoff sx={{ position: 'absolute', left: `calc(${p * 100}% - 11px)`, fontSize: 22, color: accent, transform: 'rotate(45deg)' }} />
    </Box>
  );
}

// ── Body ──

function Body({ ctx, p, pilot, base, duties }: { ctx: DayContext; p: Palette; pilot: boolean; base: string; duties: ParsedDuty[] }) {
  const navigate = useNavigate();
  const items = ctx.date ? dayItems(ctx.date, ctx.duties, base) : [];
  const now = ctx.now.getTime();
  // The main item: the leg in the air or next, else the first thing of the day.
  const mainLeg = ctx.phase === 'duty' ? ctx.nextLeg : ctx.legs[0] ?? null;
  const mainItem = items.find((i) => i.duty.dutyType !== 'Day Off' && (!i.end || i.end.getTime() > now)) ?? items[0];

  return (
    <>
      {ctx.phase === 'layover' && <RestCard ctx={ctx} p={p} duties={duties} pilot={pilot} base={base} />}

      {ctx.date && (mainLeg
        ? <BoardingPass leg={mainLeg} title={ctx.phase === 'duty' ? 'A seguir' : ctx.date === todayISO() ? 'Primeiro voo' : `Voo de ${dayWord(ctx.date)}`} />
        : mainItem && mainItem.duty.dutyType !== 'Day Off' && <ActivityPass item={mainItem} p={p} date={ctx.date} />)}

      {ctx.date && items.length > 0 && ctx.phase !== 'off' && (
        <Timeline ctx={ctx} items={items} p={p} onOpen={() => navigate(`/day/${ctx.date}`)} />
      )}

      {ctx.date && ctx.phase !== 'off' && <DayNumbers ctx={ctx} p={p} pilot={pilot} base={base} duties={duties} />}

      {(ctx.phase === 'duty' || ctx.phase === 'preflight') && ctx.legs.length > 0 && (
        <Box sx={{ px: 0.5 }}>
          <MetarTaf
            dep={ctx.phase === 'preflight' ? ctx.legs[0].duty.departureAirport : null}
            arr={(ctx.currentLeg ?? ctx.nextLeg ?? ctx.legs[0]).duty.arrivalAirport}
          />
        </Box>
      )}

      {(ctx.phase === 'off' || ctx.phase === 'standby') && <LimitRings duties={duties} pilot={pilot} p={p} />}
      {(ctx.phase === 'off' || ctx.phase === 'standby') && <WeekStrip duties={duties} base={base} p={p} />}
    </>
  );
}

const card = (p: Palette) => ({ bgcolor: p.card, borderRadius: 3, border: `1px solid ${p.line}` });
const overline = (p: Palette) => ({ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: p.soft });

function BoardingPass({ leg, title }: { leg: Leg; title: string }) {
  const d = leg.duty;
  const block = Math.round((leg.on.getTime() - leg.off.getTime()) / 60000);
  return (
    <Box component="section" aria-label={`${title}: ${d.flightNumber ?? ''}`} sx={{ borderRadius: 3, bgcolor: '#F4F1EA', color: '#14161C', overflow: 'hidden' }}>
      <Box display="flex" alignItems="center" gap={1} sx={{ px: 2, pt: 1.5 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: '0.8rem', fontWeight: 700, color: '#4A4F5B', flexGrow: 1 }}>
          {title.toUpperCase()} · {d.flightNumber ?? d.dutyCode}{d.aircraftType ? ` · ${d.aircraftType}` : ''}
        </Typography>
        {d.dutyType === 'Positioning' && (
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, bgcolor: '#E5DECF', borderRadius: 1, px: 0.75, py: 0.25 }}>DH</Typography>
        )}
      </Box>
      <Box display="grid" gridTemplateColumns="repeat(3, minmax(0, 1fr))" alignItems="center" sx={{ px: 2, pt: 0.5, pb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '2.1rem', fontWeight: 800, lineHeight: 1.1 }}>{d.departureAirport}</Typography>
          <Typography variant="body2" sx={{ color: '#4A4F5B' }}>{localAt(leg.off, d.departureAirport)}</Typography>
        </Box>
        <Box textAlign="center" sx={{ color: '#7A6A4A' }}>
          <svg width="64" height="20" viewBox="0 0 64 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M2 14 Q32 -2 62 14" strokeDasharray="3 4" /><path d="M30 6l6 3-6 3 1.5-3z" fill="currentColor" /></svg>
          <Typography variant="caption" display="block" sx={{ color: '#4A4F5B' }}>{formatDuration(block)}</Typography>
        </Box>
        <Box textAlign="right">
          <Typography sx={{ fontSize: '2.1rem', fontWeight: 800, lineHeight: 1.1 }}>{d.arrivalAirport}</Typography>
          <Typography variant="body2" sx={{ color: '#4A4F5B' }}>{localAt(leg.on, d.arrivalAirport)}</Typography>
        </Box>
      </Box>
      <Box display="grid" gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap={0.5} sx={{ px: 2, py: 1.25, borderTop: '2px dashed #CFC8B8' }}>
        <PassCell label="DATA" value={`${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`} />
        <PassCell label="PARA" value={cityName(d.arrivalAirport ?? '')} />
        <PassCell label="BLOCO" value={formatDuration(block)} />
        <PassCell label="TRIP." value={d.crew?.length ? String(d.crew.length) : '—'} />
      </Box>
    </Box>
  );
}

// The same pass for a day without flights: a simulator, course, office day or standby.
function ActivityPass({ item, p, date }: { item: Item; p: Palette; date: string }) {
  const d = item.duty;
  const span = item.start && item.end ? Math.round((item.end.getTime() - item.start.getTime()) / 60000) : null;
  const color = dutyColor(d.dutyType);
  return (
    <Box component="section" aria-label={`${TYPE_LABEL[d.dutyType] ?? d.dutyType}: ${d.dutyCode}`} sx={{ ...card(p), overflow: 'hidden' }}>
      <Box sx={{ height: 6, bgcolor: color }} />
      <Box sx={{ px: 2, pt: 1.5, pb: 1.5 }}>
        <Typography sx={overline(p)}>{(TYPE_LABEL[d.dutyType] ?? d.dutyType).toUpperCase()} · {dayWord(date).toUpperCase()}</Typography>
        <Typography sx={{ fontFamily: MONO, fontSize: '1.7rem', fontWeight: 800, mt: 0.25, wordBreak: 'break-word' }}>{d.dutyCode}</Typography>
        {d.observations && <Typography variant="body2" sx={{ color: p.soft, mt: 0.25 }}>{d.observations}</Typography>}
      </Box>
      <Box display="grid" gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap={0.5} sx={{ px: 2, py: 1.25, borderTop: `1px dashed ${p.line}` }}>
        <InfoCell p={p} label="INÍCIO" value={item.start ? localAt(item.start, item.place) : '—'} />
        <InfoCell p={p} label="FIM" value={item.end ? localAt(item.end, item.place) : '—'} />
        <InfoCell p={p} label="DURAÇÃO" value={span !== null ? formatDuration(span) : '—'} />
        <InfoCell p={p} label="LOCAL" value={item.place ?? '—'} />
      </Box>
    </Box>
  );
}

function PassCell({ label, value }: { label: string; value: string }) {
  return (
    <Box minWidth={0}>
      <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#4A4F5B', letterSpacing: '0.04em' }}>{label}</Typography>
      <Typography noWrap sx={{ fontSize: '0.92rem', fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}
function InfoCell({ p, label, value }: { p: Palette; label: string; value: string }) {
  return (
    <Box minWidth={0}>
      <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: p.soft, letterSpacing: '0.04em' }}>{label}</Typography>
      <Typography noWrap sx={{ fontSize: '0.92rem', fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

// Every duty of the day, in order — flights as routes, everything else by its code — with the
// one in progress or next marked and what's done dimmed.
function Timeline({ ctx, items, p, onOpen }: { ctx: DayContext; items: Item[]; p: Palette; onOpen: () => void }) {
  const now = ctx.now.getTime();
  const liveIdx = items.findIndex((i) => i.end && i.end.getTime() > now);
  return (
    <Box component="section" aria-label="O dia">
      <Box display="flex" alignItems="baseline" sx={{ mb: 0.75 }}>
        <Typography sx={{ ...overline(p), flexGrow: 1 }}>
          {dayWord(ctx.date!).toUpperCase()} · {items.length} {items.length === 1 ? 'SERVIÇO' : 'SERVIÇOS'}
        </Typography>
        <ButtonBase onClick={onOpen} sx={{ fontSize: '0.75rem', fontWeight: 700, color: p.accent, borderRadius: 1, px: 0.5, minHeight: 32 }}>
          Ver o dia <ChevronRight sx={{ fontSize: 18 }} />
        </ButtonBase>
      </Box>
      <Stack spacing={0.75}>
        {items.map((it, i) => {
          const d = it.duty;
          const done = !!it.end && it.end.getTime() <= now;
          const live = i === liveIdx;
          const label = it.leg ? `${d.departureAirport} → ${d.arrivalAirport}` : d.dutyCode;
          const sub = it.leg ? d.flightNumber ?? '' : TYPE_LABEL[d.dutyType] ?? d.dutyType;
          const span = it.start && it.end ? Math.round((it.end.getTime() - it.start.getTime()) / 60000) : null;
          return (
            <Box key={i} display="flex" alignItems="center" gap={1.25}
              sx={{ px: 1.5, py: 1, borderRadius: 2.5, bgcolor: p.card, border: `1px solid ${live ? p.accent : p.line}`, opacity: done ? 0.55 : 1 }}>
              <Box sx={{ width: 5, alignSelf: 'stretch', borderRadius: 1, bgcolor: live ? p.accent : dutyColor(d.dutyType) }} />
              <Box minWidth={0} sx={{ flexGrow: 1 }}>
                <Typography noWrap sx={{ fontFamily: MONO, fontWeight: 700, fontSize: '0.92rem' }}>{label}</Typography>
                <Typography noWrap sx={{ fontSize: '0.75rem', color: p.soft }}>{sub}{live ? (it.start && it.start.getTime() > now ? ' · a seguir' : ' · agora') : ''}</Typography>
              </Box>
              <Box textAlign="right">
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {it.start ? localAt(it.start, it.place) : '—'}{it.end ? `–${localAt(it.end, it.leg ? d.arrivalAirport : it.place)}` : ''}
                </Typography>
                {span !== null && <Typography sx={{ fontSize: '0.72rem', color: p.soft }}>{formatDuration(span)}</Typography>}
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

// The day's numbers as tiles, like the sketch's gauges: duty span, block, and for pilots the
// FDP against the AE maximum (left while on duty).
function DayNumbers({ ctx, p, pilot, base, duties }: { ctx: DayContext; p: Palette; pilot: boolean; base: string; duties: ParsedDuty[] }) {
  const span = ctx.window ? ctx.window.span : null;
  const block = ctx.legs.reduce((a, l) => a + Math.round((l.on.getTime() - l.off.getTime()) / 60000), 0);
  const fdp = pilot && ctx.legs.length && ctx.date
    ? fdpForDay(duties.filter((d) => d.date === ctx.date), restBefore(duties, ctx.date, 'pilot', base), base)
    : null;
  const elapsed = ctx.phase === 'duty' && ctx.window ? Math.round((ctx.now.getTime() - ctx.window.start.getTime()) / 60000) : 0;
  const tiles: { label: string; value: string; note: string; frac?: number }[] = [];
  if (span !== null) tiles.push({ label: 'SERVIÇO', value: formatDuration(span), note: ctx.window ? `${localAt(ctx.window.start, base)}–${localAt(ctx.window.end, ctx.location)}` : '' });
  if (block > 0) tiles.push({ label: 'BLOCO', value: formatDuration(block), note: `${ctx.legs.length} ${ctx.legs.length === 1 ? 'setor' : 'setores'}` });
  if (fdp) {
    tiles.push(ctx.phase === 'duty'
      ? { label: 'FDP RESTANTE', value: formatDuration(Math.max(0, fdp.max - elapsed)), note: `máx. ${formatDuration(fdp.max)} (AE)`, frac: elapsed / fdp.max }
      : { label: 'FDP', value: formatDuration(fdp.planned), note: `de ${formatDuration(fdp.max)} (AE)`, frac: fdp.planned / fdp.max });
  }
  if (!tiles.length) return null;
  return (
    <Box display="grid" gridTemplateColumns={`repeat(${tiles.length}, minmax(0, 1fr))`} gap={1}>
      {tiles.map((t) => (
        <Box key={t.label} sx={{ ...card(p), px: 1.5, py: 1.25 }}>
          <Typography sx={overline(p)}>{t.label}</Typography>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{t.value}</Typography>
          {t.frac !== undefined && (
            <Box sx={{ my: 0.5, height: 6, borderRadius: 3, bgcolor: alpha(p.soft, 0.25) }}>
              <Box sx={{ width: `${Math.min(100, t.frac * 100)}%`, height: 6, borderRadius: 3, bgcolor: t.frac > 0.9 ? '#F59E0B' : p.accent }} />
            </Box>
          )}
          <Typography noWrap sx={{ fontSize: '0.7rem', color: p.soft }}>{t.note}</Typography>
        </Box>
      ))}
    </Box>
  );
}

// The minimum rest after the duty that brought the crew here (AE for pilots, 12 h as a guide for
// cabin crew), counted from its end.
function RestCard({ ctx, p, duties, pilot, base }: { ctx: DayContext; p: Palette; duties: ParsedDuty[]; pilot: boolean; base: string }) {
  if (!ctx.lastEnd) return null;
  const rest = ctx.date ? restBefore(duties, ctx.date, pilot ? 'pilot' : 'cabin', base) : null;
  const required = rest?.requiredMinutes ?? 12 * 60;
  const until = new Date(ctx.lastEnd.getTime() + required * 60000);
  const left = until.getTime() - ctx.now.getTime();
  const done = Math.min(100, Math.max(0, ((ctx.now.getTime() - ctx.lastEnd.getTime()) / (required * 60000)) * 100));
  return (
    <Box sx={{ ...card(p), px: 2, py: 1.5 }}>
      <Box display="flex" alignItems="baseline">
        <Typography sx={{ ...overline(p), flexGrow: 1 }}>{pilot ? 'DESCANSO MÍNIMO (AE)' : 'DESCANSO'}</Typography>
        <Typography sx={{ fontSize: '0.72rem', color: p.soft }}>{formatDuration(required)}{pilot && rest?.away ? ' fora da base' : ''}</Typography>
      </Box>
      <Box display="flex" alignItems="baseline" gap={1}>
        <Typography sx={{ fontSize: '2rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{left > 0 ? countdown(left) : 'Cumprido'}</Typography>
        <Typography sx={{ fontSize: '0.85rem', color: p.soft }}>{left > 0 ? `até às ${localAt(until, ctx.location)} LT` : `desde as ${localAt(until, ctx.location)} LT`}</Typography>
      </Box>
      <Box sx={{ mt: 1, height: 8, borderRadius: 4, bgcolor: alpha(p.soft, 0.25) }}>
        <Box sx={{ width: `${done}%`, height: 8, borderRadius: 4, bgcolor: p.accent }} />
      </Box>
    </Box>
  );
}

// Three rings from the limits: flight time 28 days, duty 7 and 28 days (AE for pilots, EASA for
// cabin crew) — the same numbers as the limits page.
function LimitRings({ duties, pilot, p }: { duties: ParsedDuty[]; pilot: boolean; p: Palette }) {
  const navigate = useNavigate();
  const rows = limitRows(duties, pilot ? 'pilot' : 'cabin', todayISO());
  const pick = [
    rows.find((r) => r.group === 'Tempo de voo'),
    rows.find((r) => r.group === 'Serviço' && r.label.startsWith('7')),
    rows.find((r) => r.group === 'Serviço' && r.label.startsWith('28')),
  ].filter((r): r is NonNullable<typeof r> => !!r);
  if (!pick.length) return null;
  const colors = ['#EA580C', '#2563EB', '#0D9488'];
  const C = 2 * Math.PI * 34;
  return (
    <ButtonBase onClick={() => navigate('/limites')} sx={{ ...card(p), display: 'block', textAlign: 'left', width: '100%', px: 2, py: 1.5 }}>
      <Box display="flex" alignItems="baseline" mb={1}>
        <Typography sx={{ ...overline(p), flexGrow: 1 }}>{pilot ? 'LIMITES AE' : 'LIMITES EASA'}</Typography>
        <ChevronRight sx={{ fontSize: 18, color: p.soft }} />
      </Box>
      <Box display="grid" gridTemplateColumns={`repeat(${pick.length}, minmax(0, 1fr))`} gap={1}>
        {pick.map((r, i) => {
          const frac = r.limit > 0 ? Math.min(1, r.used / r.limit) : 0;
          return (
            <Box key={r.group + r.label} display="flex" flexDirection="column" alignItems="center" gap={0.5}>
              <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${r.group} ${r.label}: ${formatDuration(r.used)} de ${formatDuration(r.limit)}`}>
                <circle cx="42" cy="42" r="34" fill="none" stroke={p.line} strokeWidth="9" />
                <circle cx="42" cy="42" r="34" fill="none" stroke={frac > 0.9 ? '#B45309' : colors[i]} strokeWidth="9" strokeLinecap="round"
                  strokeDasharray={`${frac * C} ${C}`} transform="rotate(-90 42 42)" />
                <text x="42" y="47" textAnchor="middle" fontSize="15" fontWeight="800" fill={p.fg}>{Math.floor(r.used / 60)}h</text>
              </svg>
              <Typography sx={{ fontSize: '0.7rem', color: p.soft, textAlign: 'center', lineHeight: 1.25 }}>
                {r.group === 'Tempo de voo' ? 'Voo' : 'Serviço'} · {r.label.replace(' (pico)', '')}<br />de {Math.floor(r.limit / 60)}h
              </Typography>
            </Box>
          );
        })}
      </Box>
    </ButtonBase>
  );
}

// The next seven days as tiles: a short code each, coloured by the kind of day.
function WeekStrip({ duties, base, p }: { duties: ParsedDuty[]; base: string; p: Palette }) {
  const navigate = useNavigate();
  const start = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => isoOf(new Date(Date.parse(`${start}T12:00:00Z`) + i * DAY)));
  return (
    <Box component="section" aria-label="Próximos dias">
      <Typography sx={{ ...overline(p), mb: 0.75 }}>PRÓXIMOS DIAS</Typography>
      <Box display="grid" gridTemplateColumns="repeat(7, minmax(0, 1fr))" gap={0.75}>
        {days.map((date) => {
          const day = duties.filter((d) => d.date === date);
          const { code, type } = tileOf(date, day, base);
          const color = type ? dutyColor(type) : p.soft;
          return (
            <ButtonBase key={date} onClick={() => navigate(`/day/${date}`)} aria-label={`${longDay(date)}: ${code}`}
              sx={{
                borderRadius: 2.5, py: 1, minHeight: 66, display: 'flex', flexDirection: 'column', gap: 0.25,
                bgcolor: alpha(color, p.dark ? 0.3 : 0.16), color: p.fg,
                outline: date === start ? `2px solid ${p.accent}` : 'none',
              }}>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: p.soft }}>{weekday(date)}</Typography>
              <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1 }}>{Number(date.slice(8, 10))}</Typography>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, fontFamily: MONO }}>{code}</Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}

function tileOf(date: string, day: ParsedDuty[], base: string): { code: string; type: string | null } {
  if (!day.length) return { code: '—', type: null };
  const legs = legsOf(date, day);
  if (legs.length) return { code: dayDestination(legs, base) ?? base, type: 'Flight Duty' };
  const d = day[0];
  if (d.dutyType === 'Day Off') return { code: 'FOL', type: d.dutyType };
  if (d.dutyType === 'Vacation') return { code: 'FÉR', type: d.dutyType };
  if (d.dutyType === 'Simulator') return { code: 'SIM', type: d.dutyType };
  return { code: d.dutyCode.slice(0, 4), type: d.dutyType };
}
