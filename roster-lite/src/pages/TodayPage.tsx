import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Card, CardActionArea, Chip, Stack, Typography } from '@mui/material';
import { ChevronRight, FlightTakeoff, Login } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import {
  accentFor, cityName, dayContext, dayDestination, legsOf, skyAt,
  type Accent, type DayContext, type Leg, type Sky,
} from '../domain/dayPhase';
import { baseOf } from '../domain/dutyStats';
import { fdpForDay } from '../domain/fdp';
import { restBefore } from '../domain/restPeriods';
import { limitRows } from '../domain/limitRows';
import { dutyColor } from '../theme';
import { formatDuration } from '../utils/duration';
import { toLocalTime } from '../utils/localTime';
import { todayISO } from '../domain/rosterWindow';
import UploadDropzone from '../components/UploadDropzone';
import MetarTaf from '../components/MetarTaf';
import type { ParsedDuty } from '../domain/types';

// The home screen that changes with the crew member's day: the header is the sky over the
// airport they're at (dawn, day, dusk, night, from the real sunrise and sunset), its accent the
// day's destination, and the cards are whatever matters now — the countdown to the report, the
// leg in the air and the FDP left, the minimum rest on a layover, or the month and the week ahead
// on a day off. Everything comes from the roster; the AE figures (FDP, rest minima) only for pilots.

const SKY: Record<Sky, { bg: string; fg: string; soft: string }> = {
  night: { bg: 'linear-gradient(180deg, #050D1C 0%, #0B2236 70%, #123247 100%)', fg: '#EAF2F8', soft: '#A9C3D3' },
  dawn: { bg: 'linear-gradient(180deg, #121A3A 0%, #2A2A5C 55%, #6B4258 85%, #A4614E 100%)', fg: '#FFFFFF', soft: '#E3D3DC' },
  day: { bg: 'linear-gradient(180deg, #164E96 0%, #1F63B5 55%, #2D74C4 100%)', fg: '#FFFFFF', soft: '#D6E6F8' },
  dusk: { bg: 'linear-gradient(180deg, #221C46 0%, #5A3560 60%, #8E4E4A 100%)', fg: '#FFFFFF', soft: '#EBD7D3' },
};
const ACCENT: Record<Accent, string> = { islands: '#5EEAD4', south: '#FCD34D', north: '#93C5FD', base: '#FFFFFF' };
const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

const hhmmUtc = (d: Date) => d.toISOString().slice(11, 16);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
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

export default function TodayPage() {
  const { roster, loading, activeUser } = useRoster();
  const navigate = useNavigate();
  // Re-read the clock every minute: countdowns and the sky move on their own.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const pilot = activeUser?.role !== 'cabin';
  const base = baseOf(activeUser);
  const ctx = useMemo(() => (roster ? dayContext(roster.duties, now, base) : null), [roster, now, base]);

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

  const { sky, sunrise, sunset } = skyAt(ctx.location, now);
  const accent = ACCENT[accentFor(dayDestination(ctx.legs, base) ?? (ctx.location !== base ? ctx.location : null), base)];

  return (
    // Bleed the header to the screen edges; the cards keep the page's own padding.
    <Box sx={{ mx: { xs: -2, sm: -3 }, mt: -2 }}>
      <SkyHeader ctx={ctx} sky={sky} accent={accent} sunrise={sunrise} sunset={sunset} pilot={pilot} base={base} />
      <Stack spacing={1.5} sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
        <PhaseCards ctx={ctx} pilot={pilot} base={base} duties={roster.duties} accent={accent} />
      </Stack>
    </Box>
  );
}

// ── Header ──

function SkyHeader({ ctx, sky, accent, sunrise, sunset, pilot, base }: {
  ctx: DayContext; sky: Sky; accent: string; sunrise: Date | null; sunset: Date | null; pilot: boolean; base: string;
}) {
  const c = SKY[sky];
  const sunLabel = sky === 'night' || sky === 'dawn'
    ? sunrise && `Nascer do sol ${localAt(sunrise, ctx.location)}`
    : sunset && `Pôr do sol ${localAt(sunset, ctx.location)}`;
  const { over, big, under } = headline(ctx, pilot, base);
  return (
    <Box sx={{ background: c.bg, color: c.fg, px: 2.5, pt: 2, pb: 2.75, position: 'relative', overflow: 'hidden' }}>
      {sky === 'night' && <Stars />}
      <Box display="flex" alignItems="center" gap={1} position="relative">
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.08em', color: c.soft }}>
          {ctx.location} · {localAt(ctx.now, ctx.location)} LT
        </Typography>
        <Box flexGrow={1} />
        {sunLabel && <Typography variant="caption" sx={{ color: c.soft }}>{sunLabel}</Typography>}
      </Box>
      <Box mt={1.5} position="relative">
        <PhasePill ctx={ctx} accent={accent} />
        <Typography sx={{ mt: 1, fontSize: '0.95rem', color: c.soft }}>{over}</Typography>
        <Typography sx={{ fontSize: '2.6rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          {big}
        </Typography>
        {under && <Typography sx={{ mt: 0.5, fontSize: '0.85rem', color: c.soft }}>{under}</Typography>}
        {ctx.phase === 'duty' && ctx.currentLeg && <LegProgress leg={ctx.currentLeg} now={ctx.now} accent={accent} />}
      </Box>
    </Box>
  );
}

function Stars() {
  const pts = [[6, 14], [18, 40], [31, 9], [46, 30], [58, 12], [72, 44], [84, 18], [93, 36], [64, 70], [24, 76]];
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, opacity: 0.55, pointerEvents: 'none' }}>
      {pts.map(([x, y], i) => (
        <Box key={i} sx={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: i % 3 ? 2 : 3, height: i % 3 ? 2 : 3, borderRadius: '50%', bgcolor: '#fff' }} />
      ))}
    </Box>
  );
}

const PHASE_LABEL: Record<DayContext['phase'], string> = {
  preflight: 'Pré-voo', duty: 'Em serviço', standby: 'Assistência', layover: 'Estadia', off: 'Folga',
};

function PhasePill({ ctx, accent }: { ctx: DayContext; accent: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', height: 26, px: 1.25, borderRadius: 13, bgcolor: accent, color: '#0B1222', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.04em' }}>
      {PHASE_LABEL[ctx.phase].toUpperCase()}
    </Box>
  );
}

function headline(ctx: DayContext, pilot: boolean, base: string): { over: string; big: string; under?: string } {
  const now = ctx.now.getTime();
  const first = ctx.legs[0];
  switch (ctx.phase) {
    case 'preflight': {
      const report = ctx.window!.start;
      const route = ctx.legs.length ? `${[first.duty.departureAirport, ...ctx.legs.map((l) => l.duty.arrivalAirport)].join(' → ')}` : undefined;
      return {
        over: `Apresentação às ${localAt(report, first?.duty.departureAirport ?? ctx.location)}`,
        big: countdown(report.getTime() - now),
        under: route && `${route} · ${ctx.legs.length} ${ctx.legs.length === 1 ? 'setor' : 'setores'}`,
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
      return {
        over: ctx.nextLeg ? `Em terra em ${cityName(ctx.location)}` : 'Fim do serviço às',
        big: ctx.nextLeg ? `Sai às ${localAt(ctx.nextLeg.off, ctx.nextLeg.duty.departureAirport)}` : localAt(end, ctx.location),
        under: ctx.nextLeg ? `${ctx.nextLeg.duty.flightNumber ?? ''} para ${cityName(ctx.nextLeg.duty.arrivalAirport ?? '')} · daqui a ${countdown(ctx.nextLeg.off.getTime() - now)}` : `daqui a ${countdown(end.getTime() - now)}`,
      };
    }
    case 'standby': {
      const sby = ctx.duties.find((d) => d.dutyType.startsWith('Standby') || d.dutyType === 'Reserve');
      const live = ctx.window!.start.getTime() <= now;
      return live
        ? { over: `${sby?.dutyCode ?? 'Assistência'} · até às`, big: localAt(ctx.window!.end, base), under: `Faltam ${countdown(ctx.window!.end.getTime() - now)} · telefone ligado` }
        : { over: `${sby?.dutyCode ?? 'Assistência'} começa às ${localAt(ctx.window!.start, base)}`, big: countdown(ctx.window!.start.getTime() - now) };
    }
    case 'layover':
      return {
        over: 'Estadia em',
        big: cityName(ctx.location),
        under: ctx.window ? `Apresentação ${ctx.date === todayISO() ? 'hoje' : 'amanhã'} às ${localAt(ctx.window.start, ctx.location)} LT` : undefined,
      };
    case 'off':
    default:
      return ctx.window && ctx.date
        ? { over: 'Próximo serviço em', big: countdown(ctx.window.start.getTime() - now), under: `${longDay(ctx.date)} · apresentação ${localAt(ctx.window.start, base)}` }
        : { over: 'Folga', big: 'Descansa.', under: pilot ? 'Sem serviços nos próximos dias.' : undefined };
  }
}

function LegProgress({ leg, now, accent }: { leg: Leg; now: Date; accent: string }) {
  const p = Math.min(1, Math.max(0, (now.getTime() - leg.off.getTime()) / (leg.on.getTime() - leg.off.getTime())));
  return (
    <Box mt={1.5} aria-label={`${Math.round(p * 100)}% do voo`} role="img" sx={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center' }}>
      <Box sx={{ flexGrow: 1, height: 3, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.3)' }}>
        <Box sx={{ width: `${p * 100}%`, height: 3, borderRadius: 2, bgcolor: accent }} />
      </Box>
      <FlightTakeoff sx={{ position: 'absolute', left: `calc(${p * 100}% - 11px)`, fontSize: 22, color: accent, transform: 'rotate(45deg)' }} />
    </Box>
  );
}

// ── Cards per phase ──

function PhaseCards({ ctx, pilot, base, duties, accent }: { ctx: DayContext; pilot: boolean; base: string; duties: ParsedDuty[]; accent: string }) {
  const navigate = useNavigate();
  const blocks: ReactNode[] = [];
  const openDay = ctx.date && (
    <Button key="open" size="small" endIcon={<ChevronRight />} onClick={() => navigate(`/day/${ctx.date}`)} sx={{ alignSelf: 'flex-start' }}>
      Ver o dia completo
    </Button>
  );

  if (ctx.phase === 'preflight' || ctx.phase === 'duty') {
    const pass = ctx.phase === 'preflight' ? ctx.legs[0] : ctx.nextLeg;
    if (pass) blocks.push(<BoardingPass key="pass" leg={pass} title={ctx.phase === 'duty' ? 'A seguir' : 'Primeiro voo'} />);
    if (ctx.legs.length) blocks.push(<LegStrips key="legs" ctx={ctx} accent={accent} />);
    if (pilot && ctx.date) blocks.push(<FdpBar key="fdp" ctx={ctx} duties={duties} base={base} />);
    if (ctx.phase === 'duty' && ctx.currentLeg) {
      blocks.push(
        // Shows nothing until the weather arrives (and nothing at all without the proxy).
        <Box key="wx" sx={{ px: 0.5 }}>
          <MetarTaf dep={null} arr={ctx.currentLeg.duty.arrivalAirport} />
        </Box>,
      );
    }
    if (openDay) blocks.push(openDay);
  } else if (ctx.phase === 'layover') {
    blocks.push(<RestCard key="rest" ctx={ctx} duties={duties} pilot={pilot} base={base} />);
    const home = ctx.legs[0];
    if (home) blocks.push(<BoardingPass key="pass" leg={home} title={ctx.date === todayISO() ? 'Hoje' : 'Amanhã'} />);
    if (openDay) blocks.push(openDay);
  } else {
    blocks.push(<LimitRings key="rings" duties={duties} pilot={pilot} />);
    blocks.push(<WeekStrip key="week" duties={duties} base={base} />);
  }
  return <>{blocks}</>;
}

function BoardingPass({ leg, title }: { leg: Leg; title: string }) {
  const d = leg.duty;
  const block = Math.round((leg.on.getTime() - leg.off.getTime()) / 60000);
  return (
    <Box component="section" aria-label={`${title}: ${d.flightNumber ?? ''}`} sx={{ borderRadius: 3, bgcolor: '#F4F1EA', color: '#14161C', overflow: 'hidden' }}>
      <Box display="flex" alignItems="center" gap={1} sx={{ px: 2, pt: 1.5 }}>
        <Typography sx={{ fontFamily: MONO, fontSize: '0.8rem', fontWeight: 600, color: '#4A4F5B' }}>
          {title.toUpperCase()} · {d.flightNumber ?? d.dutyCode}{d.aircraftType ? ` · ${d.aircraftType}` : ''}
        </Typography>
        {d.dutyType === 'Positioning' && <Chip size="small" label="Posicionamento" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />}
      </Box>
      <Box display="grid" gridTemplateColumns="repeat(3, minmax(0, 1fr))" alignItems="center" sx={{ px: 2, pt: 0.5, pb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.1 }}>{d.departureAirport}</Typography>
          <Typography variant="body2" sx={{ color: '#4A4F5B' }}>{localAt(leg.off, d.departureAirport)}</Typography>
        </Box>
        <Box textAlign="center" sx={{ color: '#7A6A4A' }}>
          <svg width="64" height="20" viewBox="0 0 64 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M2 14 Q32 -2 62 14" strokeDasharray="3 4" /><path d="M30 6l6 3-6 3 1.5-3z" fill="currentColor" /></svg>
          <Typography variant="caption" display="block" sx={{ color: '#4A4F5B' }}>{formatDuration(block)}</Typography>
        </Box>
        <Box textAlign="right">
          <Typography sx={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.1 }}>{d.arrivalAirport}</Typography>
          <Typography variant="body2" sx={{ color: '#4A4F5B' }}>{localAt(leg.on, d.arrivalAirport)}</Typography>
        </Box>
      </Box>
      <Box display="grid" gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap={0.5} sx={{ px: 2, py: 1.25, borderTop: '2px dashed #CFC8B8' }}>
        <PassCell label="DATA" value={d.date.slice(8, 10) + '/' + d.date.slice(5, 7)} />
        <PassCell label="PARA" value={cityName(d.arrivalAirport ?? '')} />
        <PassCell label="TRIP." value={d.crew?.length ? String(d.crew.length) : '—'} />
      </Box>
    </Box>
  );
}

function PassCell({ label, value }: { label: string; value: string }) {
  return (
    <Box minWidth={0}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#4A4F5B', letterSpacing: '0.04em' }}>{label}</Typography>
      <Typography noWrap sx={{ fontSize: '0.95rem', fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

function LegStrips({ ctx, accent }: { ctx: DayContext; accent: string }) {
  const now = ctx.now.getTime();
  return (
    <Box component="section" aria-label="Setores do dia">
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
        {ctx.date === todayISO() ? 'Hoje' : longDay(ctx.date!)} · {ctx.legs.length} {ctx.legs.length === 1 ? 'setor' : 'setores'}
      </Typography>
      <Stack spacing={0.75}>
        {ctx.legs.map((l, i) => {
          const done = l.on.getTime() <= now;
          const live = l === ctx.currentLeg || (!ctx.currentLeg && l === ctx.nextLeg);
          return (
            <Box key={i} display="flex" alignItems="center" gap={1.25}
              sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: 'action.hover', opacity: done ? 0.55 : 1 }}>
              <Box sx={{ width: 5, alignSelf: 'stretch', borderRadius: 1, bgcolor: live ? accent === '#FFFFFF' ? 'primary.main' : accent : 'divider' }} />
              <Typography sx={{ fontFamily: MONO, fontWeight: 600, fontSize: '0.9rem', minWidth: '6.5em' }}>
                {l.duty.departureAirport} → {l.duty.arrivalAirport}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                {localAt(l.off, l.duty.departureAirport)} – {localAt(l.on, l.duty.arrivalAirport)}
              </Typography>
              <Typography variant="caption" color="text.secondary">{formatDuration(Math.round((l.on.getTime() - l.off.getTime()) / 60000))}</Typography>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

// Pilots only: the FDP against the AE maximum, and how much is left once on duty.
function FdpBar({ ctx, duties, base }: { ctx: DayContext; duties: ParsedDuty[]; base: string }) {
  const day = duties.filter((d) => d.date === ctx.date);
  const fdp = fdpForDay(day, restBefore(duties, ctx.date!, 'pilot', base), base);
  if (!fdp) return null;
  const elapsed = ctx.phase === 'duty' && ctx.window ? Math.round((ctx.now.getTime() - ctx.window.start.getTime()) / 60000) : 0;
  const shown = ctx.phase === 'duty' ? elapsed : fdp.planned;
  const pct = Math.min(100, (shown / fdp.max) * 100);
  return (
    <Card variant="outlined" sx={{ px: 1.5, py: 1.25 }}>
      <Box display="flex" alignItems="baseline" mb={0.75}>
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          {ctx.phase === 'duty' ? 'FDP restante' : 'FDP planeado'}
        </Typography>
        <Typography variant="body2" fontWeight={700}>
          {ctx.phase === 'duty' ? formatDuration(Math.max(0, fdp.max - elapsed)) : formatDuration(fdp.planned)} de {formatDuration(fdp.max)}
        </Typography>
      </Box>
      <Box sx={{ height: 8, borderRadius: 4, bgcolor: 'action.selected' }}>
        <Box sx={{ width: `${pct}%`, height: 8, borderRadius: 4, bgcolor: pct > 90 ? 'warning.main' : 'info.main' }} />
      </Box>
    </Card>
  );
}

// The minimum rest after the duty that brought the crew here (AE for pilots, 12 h as a guide
// for cabin crew), counted from its end.
function RestCard({ ctx, duties, pilot, base }: { ctx: DayContext; duties: ParsedDuty[]; pilot: boolean; base: string }) {
  if (!ctx.lastEnd) return null;
  const rest = ctx.date ? restBefore(duties, ctx.date, pilot ? 'pilot' : 'cabin', base) : null;
  const required = rest?.requiredMinutes ?? 12 * 60;
  const until = new Date(ctx.lastEnd.getTime() + required * 60000);
  const left = until.getTime() - ctx.now.getTime();
  const done = Math.min(100, Math.max(0, ((ctx.now.getTime() - ctx.lastEnd.getTime()) / (required * 60000)) * 100));
  return (
    <Card variant="outlined" sx={{ px: 1.75, py: 1.5 }}>
      <Box display="flex" alignItems="baseline">
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, flexGrow: 1, lineHeight: 1.6 }}>
          {pilot ? 'Descanso mínimo (AE)' : 'Descanso'}
        </Typography>
        <Typography variant="caption" color="text.secondary">{formatDuration(required)}{pilot ? (rest?.away ? ' fora da base' : '') : ''}</Typography>
      </Box>
      <Box display="flex" alignItems="baseline" gap={1}>
        <Typography sx={{ fontSize: '1.9rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{left > 0 ? countdown(left) : 'Cumprido'}</Typography>
        <Typography variant="body2" color="text.secondary">{left > 0 ? `até às ${localAt(until, ctx.location)} LT` : `desde as ${localAt(until, ctx.location)} LT`}</Typography>
      </Box>
      <Box sx={{ mt: 1, height: 8, borderRadius: 4, bgcolor: 'action.selected' }}>
        <Box sx={{ width: `${done}%`, height: 8, borderRadius: 4, bgcolor: 'success.main' }} />
      </Box>
    </Card>
  );
}

// Three rings from the limits: flight time 28 days, duty 7 and 28 days (AE for pilots, EASA for
// cabin crew) — the same numbers as the limits page.
function LimitRings({ duties, pilot }: { duties: ParsedDuty[]; pilot: boolean }) {
  const navigate = useNavigate();
  const rows = limitRows(duties, pilot ? 'pilot' : 'cabin', todayISO());
  const pick = [
    rows.find((r) => r.group === 'Tempo de voo'),
    rows.find((r) => r.group === 'Serviço' && r.label.startsWith('7')),
    rows.find((r) => r.group === 'Serviço' && r.label.startsWith('28')),
  ].filter((r): r is NonNullable<typeof r> => !!r);
  if (!pick.length) return null;
  const colors = ['#C2410C', '#1D4ED8', '#0F766E'];
  return (
    <Card variant="outlined">
      <CardActionArea onClick={() => navigate('/limites')} sx={{ px: 1.75, py: 1.5 }}>
        <Box display="flex" alignItems="baseline" mb={1}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, flexGrow: 1, lineHeight: 1.6 }}>
            {pilot ? 'Limites AE' : 'Limites EASA'}
          </Typography>
          <ChevronRight fontSize="small" color="action" />
        </Box>
        <Box display="grid" gridTemplateColumns={`repeat(${pick.length}, minmax(0, 1fr))`} gap={1}>
          {pick.map((r, i) => {
            const frac = r.limit > 0 ? Math.min(1, r.used / r.limit) : 0;
            const C = 2 * Math.PI * 34;
            return (
              <Box key={r.label + r.group} display="flex" flexDirection="column" alignItems="center" gap={0.5}>
                <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${r.group} ${r.label}: ${formatDuration(r.used)} de ${formatDuration(r.limit)}`}>
                  <circle cx="42" cy="42" r="34" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="9" />
                  <circle cx="42" cy="42" r="34" fill="none" stroke={frac > 0.9 ? '#B45309' : colors[i]} strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={`${frac * C} ${C}`} transform="rotate(-90 42 42)" />
                  <text x="42" y="47" textAnchor="middle" fontSize="15" fontWeight="800" fill="currentColor">{Math.floor(r.used / 60)}h</text>
                </svg>
                <Typography variant="caption" color="text.secondary" textAlign="center" lineHeight={1.2}>
                  {r.group === 'Tempo de voo' ? 'Voo' : 'Serviço'} · {r.label.replace(' (pico)', '')}<br />de {Math.floor(r.limit / 60)}h
                </Typography>
              </Box>
            );
          })}
        </Box>
      </CardActionArea>
    </Card>
  );
}

// The next seven days as tiles: a short code each, coloured by the kind of day.
function WeekStrip({ duties, base }: { duties: ParsedDuty[]; base: string }) {
  const navigate = useNavigate();
  const start = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => isoOf(new Date(Date.parse(`${start}T12:00:00Z`) + i * 86_400_000)));
  return (
    <Box component="section" aria-label="Próximos dias">
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>Próximos dias</Typography>
      <Box display="grid" gridTemplateColumns="repeat(7, minmax(0, 1fr))" gap={0.75}>
        {days.map((date) => {
          const day = duties.filter((d) => d.date === date);
          const { code, type } = tileOf(date, day, base);
          const color = type ? dutyColor(type) : '#9e9e9e';
          return (
            <Box key={date} component="button" type="button" onClick={() => navigate(`/day/${date}`)}
              aria-label={`${longDay(date)}: ${code}`}
              sx={{
                border: 0, cursor: 'pointer', font: 'inherit', color: 'text.primary', borderRadius: 2, py: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25, minHeight: 64,
                bgcolor: (t) => alpha(color, t.palette.mode === 'dark' ? 0.28 : 0.16),
                outline: date === start ? '2px solid' : 'none', outlineColor: 'primary.main',
              }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'text.secondary' }}>{weekday(date)}</Typography>
              <Typography sx={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1 }}>{Number(date.slice(8, 10))}</Typography>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, fontFamily: MONO }}>{code}</Typography>
            </Box>
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
