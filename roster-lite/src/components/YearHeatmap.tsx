import { Box, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { addDays, endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import { pt } from 'date-fns/locale';
import { activityLevel } from '../domain/activity';

// A GitHub-style calendar heatmap of daily flying for one year: 7 rows (Mon–Sun) × ~53 week
// columns, each cell shaded by the block time flown that day. Horizontally scrollable on phones.
export default function YearHeatmap({ year, minutesByDate }: { year: number; minutesByDate: Map<string, number> }) {
  const first = startOfWeek(parseISO(`${year}-01-01`), { weekStartsOn: 1 });
  const last = endOfWeek(parseISO(`${year}-12-31`), { weekStartsOn: 1 });
  const weeks: string[][] = [];
  for (let d = first; d <= last; d = addDays(d, 7)) {
    const col: string[] = [];
    for (let i = 0; i < 7; i++) col.push(format(addDays(d, i), 'yyyy-MM-dd'));
    weeks.push(col);
  }

  const cell = (theme: { palette: { primary: { main: string }; action: { hover: string } } }, lvl: number) =>
    lvl === 0 ? theme.palette.action.hover : alpha(theme.palette.primary.main, [0, 0.3, 0.5, 0.75, 1][lvl]);

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: '3px', overflowX: 'auto', pb: 0.5 }}>
        {weeks.map((col, wi) => (
          <Box key={wi} sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {col.map((iso) => {
              const inYear = iso.slice(0, 4) === String(year);
              const mins = minutesByDate.get(iso) ?? 0;
              const lvl = activityLevel(mins);
              if (!inYear) return <Box key={iso} sx={{ width: 11, height: 11 }} />;
              const h = Math.floor(mins / 60), m = mins % 60;
              const label = `${format(parseISO(iso), 'EEE dd MMM', { locale: pt })} · ${mins ? `${h}h${String(m).padStart(2, '0')}` : 'sem voo'}`;
              return (
                <Tooltip key={iso} title={label} arrow disableInteractive>
                  <Box sx={{ width: 11, height: 11, borderRadius: '2px', bgcolor: (t) => cell(t, lvl) }} />
                </Tooltip>
              );
            })}
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, justifyContent: 'flex-end' }}>
        <Typography variant="caption" color="text.secondary">menos</Typography>
        {[0, 1, 2, 3, 4].map((lvl) => (
          <Box key={lvl} sx={{ width: 11, height: 11, borderRadius: '2px', bgcolor: (t) => cell(t, lvl) }} />
        ))}
        <Typography variant="caption" color="text.secondary">mais</Typography>
      </Box>
    </Box>
  );
}
