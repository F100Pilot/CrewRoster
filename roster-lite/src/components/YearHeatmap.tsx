import { Box, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { addDays, endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import { pt } from 'date-fns/locale';
import { activityLevel, type GroundKind } from '../domain/activity';

// Non-flying days each get their own colour, all clearly off the indigo flight gradient:
// simulator = orange, training = teal, office = purple, absence (falta) = red.
const GROUND_COLOR: Record<GroundKind, string> = { sim: '#f57c00', training: '#00897b', office: '#8e24aa', absence: '#d32f2f' };
const GROUND_LABEL: Record<GroundKind, string> = { sim: 'Simulador', training: 'Formação', office: 'Gabinete', absence: 'Falta' };
const GROUND_ORDER: GroundKind[] = ['sim', 'training', 'office', 'absence'];

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
export default function YearHeatmap({
  year,
  minutesByDate,
  groundByDate,
}: {
  year: number;
  minutesByDate: Map<string, number>;
  groundByDate?: Map<string, GroundKind>;
}) {
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

  // A day's cell colour: flown block shades the flight gradient; otherwise a non-flying work day
  // (sim/training/office) gets the flat ground hue; empty days are the faint background.
  type Pal = { palette: { primary: { main: string }; action: { hover: string } } };
  const cellBg = (theme: Pal, mins: number, ground: GroundKind | undefined) => {
    const lvl = activityLevel(mins);
    if (lvl > 0) return alpha(theme.palette.primary.main, [0, 0.28, 0.5, 0.75, 1][lvl]);
    if (ground) return alpha(GROUND_COLOR[ground], 0.8);
    return theme.palette.action.hover;
  };
  // Legend swatch for the flight gradient only (ground is shown separately).
  const cell = (theme: Pal, lvl: number) =>
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
                  const ground = mins > 0 ? undefined : groundByDate?.get(iso);
                  const coloured = mins > 0 || !!ground;
                  const h = Math.floor(mins / 60), m = mins % 60;
                  const detail = mins
                    ? `${h}h${String(m).padStart(2, '0')}`
                    : ground
                      ? GROUND_LABEL[ground]
                      : 'sem voo';
                  const label = `${format(parseISO(iso), 'EEE dd MMM', { locale: pt })} · ${detail}`;
                  return (
                    <Tooltip key={iso} title={label} arrow disableInteractive enterTouchDelay={0} leaveTouchDelay={2500}>
                      <Box
                        sx={{
                          width: CELL,
                          height: CELL,
                          borderRadius: '3px',
                          bgcolor: (t) => cellBg(t, mins, ground),
                          // a faint outline on every cell so the day grid itself is visible,
                          // not just the coloured days
                          border: '1px solid',
                          borderColor: coloured ? 'rgba(0,0,0,0.10)' : 'rgba(128,128,128,0.18)',
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

      {/* legend: flight gradient + the ground (sim/office/training) swatch */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">Voo</Typography>
          {[1, 2, 3, 4].map((lvl) => (
            <Box key={lvl} sx={{ width: CELL, height: CELL, borderRadius: '3px', bgcolor: (t) => cell(t, lvl) }} />
          ))}
        </Box>
        {GROUND_ORDER.map((k) => (
          <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: CELL, height: CELL, borderRadius: '3px', bgcolor: alpha(GROUND_COLOR[k], 0.8) }} />
            <Typography variant="caption" color="text.secondary">{GROUND_LABEL[k]}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
