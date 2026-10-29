import { useEffect, useRef, useState } from 'react';
import { Box, Card, CardContent, ToggleButton, ToggleButtonGroup, Typography, useTheme } from '@mui/material';
import { formatDuration } from '../utils/duration';
import { niceHourAxis, type MonthTotal } from '../domain/monthlyTotals';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];
const monthIdx = (k: string) => Number(k.slice(5, 7)) - 1;

type Measure = 'block' | 'duty';

// Chart geometry (px). One series, so no legend: the toggle names what's plotted.
const H = 150;
const TOP = 16; // room for the value on the selected column's cap
const BOTTOM = 18; // month labels
const AXIS = 30; // hour labels on the left
const MAX_BAR = 20;

// A column with a 4px rounded top and a square foot on the baseline.
function columnPath(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, base - y);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

// Block or duty per month over the last year, as columns. Tap a column to read it; the current
// month is selected to start with.
export default function MonthlyChart({ months }: { months: MonthTotal[] }) {
  const theme = useTheme();
  const ink = theme.palette.mode === 'dark' ? '#7986cb' : '#3f51b5';
  const [measure, setMeasure] = useState<Measure>('block');
  const [selected, setSelected] = useState(months.length - 1);

  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = months.map((m) => (measure === 'block' ? m.block : m.duty));
  const { top, step } = niceHourAxis(Math.max(0, ...values.map((v) => v ?? 0)));
  const base = H - BOTTOM;
  const plotW = width - AXIS;
  const slot = plotW / months.length;
  const barW = Math.min(MAX_BAR, Math.max(6, slot * 0.6));
  const y = (v: number) => base - (v / top) * (base - TOP);
  const ticks: number[] = [];
  for (let t = step; t <= top; t += step) ticks.push(t);

  const sel = months[selected];
  const selValue = values[selected];
  const isCurrent = selected === months.length - 1;
  const label = measure === 'block' ? 'bloco' : 'serviço';

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Evolução mensal</Typography>
          <ToggleButtonGroup
            size="small" exclusive value={measure}
            onChange={(_, v: Measure | null) => v && setMeasure(v)}
            sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: '0.75rem', textTransform: 'none' } }}
          >
            <ToggleButton value="block">Bloco</ToggleButton>
            <ToggleButton value="duty">Serviço</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box ref={boxRef}>
          <svg width={width} height={H} role="img" aria-label={`Horas de ${label} por mês, últimos ${months.length} meses`} style={{ display: 'block' }}>
            {/* Hairline grid on round hours; the baseline is the only solid line. */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={AXIS} x2={width} y1={y(t)} y2={y(t)} stroke={theme.palette.divider} strokeWidth={1} />
                <text x={AXIS - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={theme.palette.text.secondary}>{t / 60}h</text>
              </g>
            ))}
            <line x1={AXIS} x2={width} y1={base} y2={base} stroke={theme.palette.text.disabled} strokeWidth={1} />

            {months.map((m, i) => {
              const v = values[i];
              const cx = AXIS + slot * i + slot / 2;
              const on = i === selected;
              return (
                <g key={m.month} onClick={() => setSelected(i)} style={{ cursor: 'pointer' }}>
                  {v != null && v > 0 && (
                    <path d={columnPath(cx - barW / 2, y(v), barW, base)} fill={ink} opacity={on ? 1 : 0.7} />
                  )}
                  {/* No roster stored for the month: a short dash on the baseline, not a 0 column. */}
                  {v == null && (
                    <line x1={cx - 3} x2={cx + 3} y1={base - 3} y2={base - 3} stroke={theme.palette.text.disabled} strokeWidth={1.5} />
                  )}
                  {on && v != null && (
                    <text x={cx} y={y(v) - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={theme.palette.text.primary}>
                      {Math.round(v / 60)}h
                    </text>
                  )}
                  <text
                    x={cx} y={H - 4} textAnchor="middle" fontSize={10}
                    fontWeight={on ? 700 : 400}
                    fill={on ? theme.palette.text.primary : theme.palette.text.secondary}
                  >
                    {MONTHS[monthIdx(m.month)]}
                  </text>
                  {/* Hit target: the whole slot, taller and wider than the column. */}
                  <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="transparent" />
                </g>
              );
            })}
          </svg>
        </Box>

        <Typography variant="caption" color="text.secondary" display="block" mt={0.5} aria-live="polite">
          <Box component="span" fontWeight={700} color="text.primary">
            {MONTHS_LONG[monthIdx(sel.month)]} {sel.month.slice(0, 4)}
          </Box>
          {' · '}
          {selValue == null ? 'sem escala guardada para este mês' : `${formatDuration(selValue)} de ${label}`}
          {isCurrent && selValue != null && ' (inclui o planeado)'}
        </Typography>
        {measure === 'duty' && (
          <Typography variant="caption" color="text.disabled" display="block">
            Serviço contado como nos limites (assistências ponderadas). Só há valores nos meses com escala guardada.
          </Typography>
        )}

        {/* The same numbers as a table, for screen readers. */}
        <Box
          component="table"
          sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
        >
          <caption>Horas de bloco e serviço por mês</caption>
          <thead><tr><th>Mês</th><th>Bloco</th><th>Serviço</th></tr></thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <td>{MONTHS_LONG[monthIdx(m.month)]} {m.month.slice(0, 4)}</td>
                <td>{formatDuration(m.block)}</td>
                <td>{m.duty == null ? 'sem escala' : formatDuration(m.duty)}</td>
              </tr>
            ))}
          </tbody>
        </Box>
      </CardContent>
    </Card>
  );
}
