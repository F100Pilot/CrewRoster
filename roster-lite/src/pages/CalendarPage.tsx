import { useMemo, useRef } from 'react';
import { Box, Button, Card, CardContent, IconButton, Stack, Typography } from '@mui/material';
import { alpha, darken, lighten, useTheme } from '@mui/material/styles';
import { ChevronLeft, ChevronRight, Today } from '@mui/icons-material';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday,
  parseISO, startOfMonth, startOfWeek, subMonths,
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { useViewedMonth } from '../state/viewedMonth';
import MonthStatsCard from '../components/MonthStatsCard';
import ShareMonthMenu from '../components/ShareMonthMenu';
import { depth, dutyColor } from '../theme';
import type { ParsedDuty } from '../domain/types';
import { monthLabel } from '../utils/dates';
import PageHero from '../components/PageHero';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// Short Portuguese labels for the colour legend, keyed by dutyType.
const DUTY_LABELS: Record<string, string> = {
  'Flight Duty': 'Voo',
  Positioning: 'Posicionamento',
  'Standby Airport': 'Standby',
  'Standby Home': 'Standby',
  Reserve: 'Reserva',
  'Office Duty': 'Escritório',
  Training: 'Formação',
  Simulator: 'Simulador',
  Medical: 'Médico',
  Absence: 'Ausência',
  Vacation: 'Férias',
  'Day Off': 'Folga',
  Other: 'Outro',
};

export default function CalendarPage() {
  const { roster, activeUser } = useRoster();
  const theme = useTheme();
  const d3 = depth(theme.palette.mode);
  const navigate = useNavigate();
  const [month, setMonth] = useViewedMonth();

  const dutiesByDay = useMemo(() => {
    const map = new Map<string, ParsedDuty[]>();
    for (const d of roster?.duties ?? []) {
      if (!map.has(d.date)) map.set(d.date, []);
      map.get(d.date)!.push(d);
    }
    return map;
  }, [roster]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const monthDuties = useMemo(
    () => (roster?.duties ?? []).filter((d) => isSameMonth(parseISO(d.date), month)),
    [roster, month],
  );

  // Distinct duty types present this month → an adaptive colour legend (label + colour).
  const legend = useMemo(() => {
    const seen = new Map<string, string>(); // label → colour
    for (const d of monthDuties) {
      const label = DUTY_LABELS[d.dutyType] ?? d.dutyType;
      if (!seen.has(label)) seen.set(label, dutyColor(d.dutyType));
    }
    return [...seen.entries()];
  }, [monthDuties]);

  // Horizontal swipe to change month: left → next, right → previous. Ignores mostly-
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
    setMonth((m) => (dx < 0 ? addMonths(m, 1) : subMonths(m, 1)));
  };

  if (!roster) {
    return <Typography color="text.secondary">Importa uma escala na página Lista primeiro.</Typography>;
  }

  return (
    <Stack spacing={2} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <PageHero
        label="Calendário"
        title={monthLabel(month)}
        actions={
          <>
            <ShareMonthMenu monthKey={format(month, 'yyyy-MM')} duties={roster?.duties ?? []} user={activeUser ?? null} />
            <Button size="small" variant="outlined" startIcon={<Today />} onClick={() => setMonth(new Date())}>Hoje</Button>
          </>
        }
      >
        <Box display="flex" gap={1} mt={1}>
          <IconButton size="small" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Mês anterior">
            <ChevronLeft />
          </IconButton>
          <IconButton size="small" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Mês seguinte">
            <ChevronRight />
          </IconButton>
        </Box>
      </PageHero>

      {/* 3D look: the month on a raised board, each day a key coloured by its main duty. */}
      <Box sx={{ p: 1.25, borderRadius: '22px', background: d3.surface, boxShadow: d3.card }}>
        <Box display="grid" gridTemplateColumns="repeat(7, minmax(0, 1fr))" gap={0.6}>
          {WEEKDAYS.map((d) => (
            <Typography key={d} variant="caption" align="center" color="text.secondary" fontWeight={800} sx={{ fontSize: '0.62rem', letterSpacing: '0.06em', mb: 0.25 }}>
              {d}
            </Typography>
          ))}
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayDuties = dutiesByDay.get(key) ?? [];
            const inMonth = isSameMonth(day, month);
            const today = isToday(day);
            const main = dayDuties.find((x) => x.dutyType === 'Flight Duty' || x.dutyType === 'Positioning')
              ?? dayDuties.find((x) => x.dutyType !== 'Day Off') ?? dayDuties[0];
            const off = !main || main.dutyType === 'Day Off';
            const col = main ? dutyColor(main.dutyType) : '#9e9e9e';
            const label = main ? (main.flightNumber || main.dutyCode) : '';
            const keyBg = off ? d3.keyLight : `linear-gradient(180deg, ${lighten(col, 0.25)}, ${darken(col, 0.05)})`;
            const edge = off ? d3.keyEdge : darken(col, 0.4);
            return (
              <Box
                key={key}
                component="button"
                onClick={() => navigate(`/day/${key}`)}
                aria-label={`${format(day, 'd')}${label ? ` · ${label}` : ''}`}
                sx={{
                  minHeight: 54, minWidth: 0, p: 0.4, border: 0, cursor: 'pointer', borderRadius: '12px', mb: '3px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px',
                  font: 'inherit', color: off ? 'text.primary' : '#fff',
                  opacity: inMonth ? 1 : 0.35,
                  background: keyBg,
                  boxShadow: today
                    ? `0 0 0 3px ${theme.palette.background.paper}, 0 0 0 5px ${theme.palette.primary.main}, 0 10px 16px -6px ${alpha(theme.palette.primary.main, 0.7)}`
                    : `0 3px 0 ${edge}, 0 8px 10px -6px rgba(15,27,45,.45), inset 0 1px 0 rgba(255,255,255,.45)`,
                  '&:active': { transform: 'translateY(2px)' },
                }}
              >
                <Box component="span" sx={{ fontWeight: 800, fontSize: '0.9rem', lineHeight: 1.1 }}>{format(day, 'd')}</Box>
                {label && (
                  <Box component="span" sx={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.56rem', fontWeight: 700, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: off ? 0.75 : 0.95 }}>
                    {label}{dayDuties.length > 1 ? ` +${dayDuties.length - 1}` : ''}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>

      <MonthStatsCard duties={monthDuties} />

      {legend.length > 0 && (
        <Card variant="outlined">
          <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
            <Box display="flex" flexWrap="wrap" gap={1.5}>
              {legend.map(([label, color]) => (
                <Box key={label} display="flex" alignItems="center" gap={0.5}>
                  <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: color }} />
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
