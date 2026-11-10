import { Box, Typography } from '@mui/material';
import type { ChangeType, ParsedDuty } from '../domain/types';
import { checkInTimeLabel } from '../utils/localTime';

// The month as an airport departures board: one row per day — the day, a code (the first flight
// or the duty code), the route, the report time and a status like the board's (HOJE, NOVO,
// ALTERADO, FOLGA). Always dark, as a board is; the codes in monospace so the columns read down.

const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const COLS = '2.4em 4.6em minmax(0, 1fr) 3em 4.4em';

type Status = 'today' | 'added' | 'modified' | 'off' | 'done' | 'planned';
const STATUS: Record<Status, { label: string; fg: string; bg: string }> = {
  today: { label: 'HOJE', fg: '#4ADE80', bg: '#06210F' },
  added: { label: 'NOVO', fg: '#67C7FF', bg: '#05233A' },
  modified: { label: 'ALTERADO', fg: '#FFC56B', bg: '#2B1D05' },
  off: { label: 'FOLGA', fg: '#9AA3B5', bg: '#1A1E28' },
  done: { label: 'FEITO', fg: '#9AA3B5', bg: '#141821' },
  planned: { label: 'PREVISTO', fg: '#D5DAE5', bg: '#141A24' },
};
const OFF = new Set(['Day Off', 'Vacation']);

function rowOf(date: string, duties: ParsedDuty[]) {
  const flights = duties.filter((d) => (d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning') && d.departureAirport);
  const first = duties[0];
  const code = flights[0]?.flightNumber ?? first?.dutyCode ?? '—';
  const route = flights.length
    ? [flights[0].departureAirport, ...flights.map((f) => f.arrivalAirport)].join(' ')
    : first?.dutyType === 'Day Off' ? 'Folga' : first?.dutyType === 'Vacation' ? 'Férias' : first?.dutyType ?? '';
  const withReport = duties.find((d) => d.reportingTime);
  const report = withReport ? checkInTimeLabel(date, withReport.reportingTime!, withReport.departureAirport).replace(' LT', '') : '';
  return { code, route, report, off: duties.every((d) => OFF.has(d.dutyType)) };
}

export default function DepartureBoard({ days, changes, today, onOpen }: {
  days: [string, ParsedDuty[]][];
  changes: Map<string, ChangeType>;
  today: string;
  onOpen: (date: string) => void;
}) {
  return (
    <Box sx={{ bgcolor: '#0B0D12', color: '#EDEFF5', borderRadius: 3, overflow: 'hidden' }}>
      <Box display="grid" gridTemplateColumns={COLS} gap={0.75}
        sx={{ px: 1.25, py: 1, bgcolor: '#11141B', borderBottom: '1px solid #1E2330', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', color: '#8C94A8' }}>
        <span>DIA</span><span>CÓDIGO</span><span>ROTA</span><span>APR.</span><span>ESTADO</span>
      </Box>
      {days.map(([date, duties]) => {
        const r = rowOf(date, duties);
        const change = changes.get(date);
        const status: Status = date === today ? 'today'
          : change === 'added' ? 'added' : change === 'modified' ? 'modified'
            : r.off ? 'off' : date < today ? 'done' : 'planned';
        const s = STATUS[status];
        const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-PT', { weekday: 'short', timeZone: 'UTC' }).replace('.', '').slice(0, 3).toUpperCase();
        return (
          <Box key={date} component="button" type="button" onClick={() => onOpen(date)}
            aria-label={`${weekday} ${Number(date.slice(8, 10))}: ${r.code} ${r.route} ${s.label}`}
            sx={{
              display: 'grid', gridTemplateColumns: COLS, gap: 0.75, alignItems: 'center', width: '100%',
              minHeight: 50, px: 1.25, py: 0.75, border: 0, borderBottom: '1px solid #171B25', textAlign: 'left',
              font: 'inherit', color: 'inherit', cursor: 'pointer',
              bgcolor: status === 'today' ? '#0F1A13' : 'transparent', opacity: status === 'done' ? 0.6 : 1,
              '&:hover': { bgcolor: '#151A24' },
            }}>
            <Box display="flex" flexDirection="column">
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: '#8C94A8', lineHeight: 1.2 }}>{weekday}</Typography>
              <Typography sx={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.1 }}>{Number(date.slice(8, 10))}</Typography>
            </Box>
            <Typography noWrap sx={{ fontFamily: MONO, fontSize: '0.78rem', fontWeight: 700, color: r.off ? '#8C94A8' : '#FFC56B', bgcolor: '#161A23', borderRadius: 1, px: 0.5, py: 0.4, textAlign: 'center' }}>
              {r.code}
            </Typography>
            {/* A long day's route wraps onto a second line rather than being cut. */}
            <Typography sx={{ fontFamily: MONO, fontSize: '0.74rem', fontWeight: 600, color: '#DDE2EC', lineHeight: 1.3, wordBreak: 'break-word' }}>{r.route}</Typography>
            <Typography sx={{ fontFamily: MONO, fontSize: '0.74rem', color: '#C9CFDD' }}>{r.report}</Typography>
            <Typography sx={{ fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.05em', textAlign: 'center', borderRadius: 1, py: 0.5, color: s.fg, bgcolor: s.bg }}>
              {s.label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
