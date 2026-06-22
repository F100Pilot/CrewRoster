import { useMemo, useState } from 'react';
import { Box, IconButton, Paper, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday,
  startOfMonth, startOfWeek, subMonths,
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { dutyColor } from '../theme';
import type { ParsedDuty } from '../domain/types';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export default function CalendarPage() {
  const { roster } = useRoster();
  const navigate = useNavigate();
  const [month, setMonth] = useState(new Date());

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

  if (!roster) {
    return <Typography color="text.secondary">Importa uma escala na página Lista primeiro.</Typography>;
  }

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" justifyContent="center" gap={1}>
        <IconButton size="small" onClick={() => setMonth((m) => subMonths(m, 1))}>
          <ChevronLeft />
        </IconButton>
        <Typography variant="h6">{format(month, 'MMMM yyyy')}</Typography>
        <IconButton size="small" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight />
        </IconButton>
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
              onClick={() => dayDuties.length && navigate(`/day/${key}`)}
              sx={{
                minHeight: 64, minWidth: 0, p: 0.5, cursor: dayDuties.length ? 'pointer' : 'default',
                opacity: inMonth ? 1 : 0.4,
                borderColor: today ? 'primary.main' : 'divider',
                borderWidth: today ? 2 : 1,
                bgcolor: today ? (t) => alpha(t.palette.primary.main, 0.08) : undefined,
              }}
            >
              {today ? (
                <Box
                  sx={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 18, height: 18, borderRadius: '50%',
                    bgcolor: 'primary.main', color: '#fff',
                    fontSize: '0.6rem', fontWeight: 700,
                  }}
                >
                  {format(day, 'd')}
                </Box>
              ) : (
                <Typography variant="caption">{format(day, 'd')}</Typography>
              )}
              <Stack spacing={0.25} mt={0.25}>
                {dayDuties.slice(0, 2).map((d, i) => (
                  <Box
                    key={i}
                    sx={{
                      bgcolor: dutyColor(d.dutyType),
                      color: d.dutyType === 'Day Off' ? 'text.primary' : '#fff',
                      borderRadius: 0.5, px: 0.5, fontSize: '0.55rem', lineHeight: 1.3,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {d.flightNumber || d.dutyCode}
                  </Box>
                ))}
                {dayDuties.length > 2 && (
                  <Typography variant="caption" sx={{ fontSize: '0.5rem' }} color="text.secondary">
                    +{dayDuties.length - 2}
                  </Typography>
                )}
              </Stack>
            </Paper>
          );
        })}
      </Box>
    </Stack>
  );
}
