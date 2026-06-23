import { useMemo, useRef } from 'react';
import { Box, Button, Card, CardContent, IconButton, Paper, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ChevronLeft, ChevronRight, Today } from '@mui/icons-material';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday,
  parseISO, startOfMonth, startOfWeek, subMonths,
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { useViewedMonth } from '../state/viewedMonth';
import MonthStatsCard from '../components/MonthStatsCard';
import { dutyColor } from '../theme';
import type { ParsedDuty } from '../domain/types';

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
  const { roster } = useRoster();
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
      <Box display="flex" alignItems="center" gap={1}>
        <Box flex={1} />
        <IconButton size="small" onClick={() => setMonth((m) => subMonths(m, 1))}>
          <ChevronLeft />
        </IconButton>
        <Typography variant="h6" sx={{ minWidth: 150, textAlign: 'center' }}>
          {format(month, 'MMMM yyyy')}
        </Typography>
        <IconButton size="small" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight />
        </IconButton>
        <Box flex={1} display="flex" justifyContent="flex-end">
          <Button size="small" startIcon={<Today />} onClick={() => setMonth(new Date())}>
            Hoje
          </Button>
        </Box>
      </Box>

      <Box display="grid" gridTemplateColumns="repeat(7, 1fr)" gap={0.5}>
        {WEEKDAYS.map((d) => (
          <Typography key={d} variant="caption" align="center" color="text.secondary" fontWeight={600}>
            {d}
          </Typography>
        ))}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayDuties = dutiesByDay.get(key) ?? [];
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          return (
            <Paper
              key={key}
              variant="outlined"
              onClick={() => navigate(`/day/${key}`)}
              sx={{
                minHeight: 88, minWidth: 0, p: 0.5, cursor: 'pointer',
                opacity: inMonth ? 1 : 0.45,
                borderColor: today ? 'primary.main' : 'divider',
                borderWidth: today ? 2 : 1,
                bgcolor: today ? (t) => alpha(t.palette.primary.main, 0.08) : undefined,
              }}
            >
              {today ? (
                <Box
                  sx={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%',
                    bgcolor: 'primary.main', color: '#fff',
                    fontSize: '0.7rem', fontWeight: 700,
                  }}
                >
                  {format(day, 'd')}
                </Box>
              ) : (
                <Typography variant="caption" fontWeight={600}>{format(day, 'd')}</Typography>
              )}
              <Stack spacing={0.25} mt={0.25}>
                {dayDuties.slice(0, 3).map((d, i) => (
                  <Box
                    key={i}
                    sx={{
                      bgcolor: dutyColor(d.dutyType),
                      color: d.dutyType === 'Day Off' ? 'text.primary' : '#fff',
                      borderRadius: 0.5, px: 0.5, fontSize: '0.62rem', lineHeight: 1.35,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {d.flightNumber || d.dutyCode}
                  </Box>
                ))}
                {dayDuties.length > 3 && (
                  <Typography variant="caption" sx={{ fontSize: '0.55rem' }} color="text.secondary">
                    +{dayDuties.length - 3}
                  </Typography>
                )}
              </Stack>
            </Paper>
          );
        })}
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
