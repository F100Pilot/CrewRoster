import { Box, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { addDays, endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import { pt } from 'date-fns/locale';
import { activityLevel } from '../domain/activity';

const CELL = 13; // px — a touch bigger than GitHub so days read on a phone
const GAP = 3;
const GUTTER = 26; // left column for the weekday labels

// Weekday labels down the left (Mon-first). Only odd-out rows are labelled (Seg/Qua/Sex), like
// GitHub, so the column stays legible without crowding every row.
const DOW = ['Seg', '', 'Qua', '', 'Sex', '', ''];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A calendar heatmap of daily flying for one year: 7 rows (Mon–Sun) × ~53 week columns, each cell
// shaded by the block time flown that day, with month labels across the top and weekday labels
// down the left so you can read which day each cell is. Horizontally scrollable on phones.
export default function YearHeatmap({ year, minutesByDate }: { year: number; minutesByDate: Map<string, number> }) {
  const first = startOfWeek(parseISO(`${year}-01-01`), { weekStartsOn: 1 });
  const last = endOfWeek(parseISO(`${year}-12-31`), { weekStartsOn: 1 });
  const weeks: string[][] = [];
  for (let d = first; d <= last; d = addDays(d, 7)) {
    const col: string[] = [];
    for (let i = 0; i < 7; i++) col.push(format(addDays(d, i), 'yyyy-MM-dd'));
    weeks.push(col);
  }

  // Month label above the first week column that belongs to a new month (probed on the Thursday,
  // which owns the week), so labels line up with where each month begins.
  let prevMonth = '';
  const monthLabels = weeks.map((col) => {
    const probe = col[3];
    const inYear = probe.slice(0, 4) === String(year);
    const month = probe.slice(0, 7);
    if (inYear && month !== prevMonth) {
      prevMonth = month;
      return cap(format(parseISO(probe), 'LLL', { locale: pt }));
    }
    return '';
  });

  const cell = (theme: { palette: { primary: { main: string }; action: { hover: string } } }, lvl: number) =>
    lvl === 0 ? theme.palette.action.hover : alpha(theme.palette.primary.main, [0, 0.28, 0.5, 0.75, 1][lvl]);

  return (
    <Box>
      <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
        {/* month labels, aligned with the week columns (offset by the weekday gutter) */}
        <Box sx={{ display: 'flex', gap: `${GAP}px`, ml: `${GUTTER}px`, mb: '3px', width: 'max-content' }}>
          {monthLabels.map((m, wi) => (
            <Box
              key={wi}
              sx={{ width: CELL, position: 'relative', height: 12 }}
            >
              {m && (
                <Typography
                  variant="caption"
                  sx={{ position: 'absolute', left: 0, top: 0, fontSize: 10, lineHeight: '12px', color: 'text.secondary', whiteSpace: 'nowrap' }}
                >
                  {m}
                </Typography>
              )}
            </Box>
          ))}
        </Box>

        <Box sx={{ display: 'flex', width: 'max-content' }}>
          {/* weekday labels */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${GAP}px`, width: GUTTER, flexShrink: 0 }}>
            {DOW.map((lbl, i) => (
              <Typography
                key={i}
                variant="caption"
                sx={{ height: CELL, lineHeight: `${CELL}px`, fontSize: 10, color: 'text.secondary' }}
              >
                {lbl}
              </Typography>
            ))}
          </Box>

          {/* the grid */}
          <Box sx={{ display: 'flex', gap: `${GAP}px` }}>
            {weeks.map((col, wi) => (
              <Box key={wi} sx={{ display: 'flex', flexDirection: 'column', gap: `${GAP}px` }}>
                {col.map((iso) => {
                  const inYear = iso.slice(0, 4) === String(year);
                  if (!inYear) return <Box key={iso} sx={{ width: CELL, height: CELL }} />;
                  const mins = minutesByDate.get(iso) ?? 0;
                  const lvl = activityLevel(mins);
                  const h = Math.floor(mins / 60), m = mins % 60;
                  const label = `${format(parseISO(iso), 'EEE dd MMM', { locale: pt })} · ${mins ? `${h}h${String(m).padStart(2, '0')}` : 'sem voo'}`;
                  return (
                    <Tooltip key={iso} title={label} arrow disableInteractive enterTouchDelay={0} leaveTouchDelay={2500}>
                      <Box
                        sx={{
                          width: CELL,
                          height: CELL,
                          borderRadius: '3px',
                          bgcolor: (t) => cell(t, lvl),
                          // a faint outline on every cell so the day grid itself is visible,
                          // not just the coloured days
                          border: '1px solid',
                          borderColor: lvl === 0 ? 'rgba(128,128,128,0.18)' : 'rgba(0,0,0,0.10)',
                          cursor: 'default',
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* legend */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, justifyContent: 'flex-end' }}>
        <Typography variant="caption" color="text.secondary">menos</Typography>
        {[0, 1, 2, 3, 4].map((lvl) => (
          <Box key={lvl} sx={{ width: CELL, height: CELL, borderRadius: '3px', bgcolor: (t) => cell(t, lvl) }} />
        ))}
        <Typography variant="caption" color="text.secondary">mais</Typography>
      </Box>
    </Box>
  );
}
