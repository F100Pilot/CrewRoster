import { Box, Tooltip } from '@mui/material';
import { PassBadge, PassCard, type PassCell } from './PassCard';
import { dutyColor } from '../theme';
import { legsOf } from '../domain/dayPhase';
import { dayItems } from '../domain/dayItems';
import { dutyTypeLabel } from '../domain/dutyLabels';
import { MARK_SHORT, dayMarks, isInstructorMark } from '../domain/dutyMarks';
import { formatDuration } from '../utils/duration';
import { checkInTimeLabel, localClock } from '../utils/localTime';
import { dayLabel } from '../utils/dates';
import type { ChangeType, ParsedDuty } from '../domain/types';

// One day of the roster as a "Hoje" pass: the main duty's colour on the strip, the date and what
// the day is on the small line, the route (or the codes) as the title, and the day's figures.

// Wide enough for the widest "Qua, 28 set" in the overline, so what follows the date lines up
// from one card to the next (user: "alinha sempre").
const DATE_COLUMN = '9.2em';

export const CHANGE_STYLE: Record<ChangeType, { color: string; label: string }> = {
  added: { color: '#2e7d32', label: 'Novo' },
  modified: { color: '#ed6c02', label: 'Alterado' },
  removed: { color: '#c62828', label: 'Removido' },
};

const FLIGHT = new Set(['Flight Duty', 'Positioning']);

function mainDuty(duties: ParsedDuty[]): ParsedDuty {
  return duties.find((d) => FLIGHT.has(d.dutyType)) ?? duties.find((d) => d.dutyType !== 'Day Off') ?? duties[0];
}

export default function DayPass({ date, duties, change, isToday, base, onOpen }: {
  date: string; duties: ParsedDuty[]; change?: ChangeType; isToday?: boolean; base: string; onOpen: () => void;
}) {
  const main = mainDuty(duties);
  const legs = legsOf(date, duties);
  const others = duties.filter((d) => !FLIGHT.has(d.dutyType));
  let title: string;
  let sub: string | undefined;
  let cells: PassCell[] | undefined;

  if (legs.length) {
    const route = [legs[0].duty.departureAirport, ...legs.map((l) => l.duty.arrivalAirport)];
    title = route.filter(Boolean).join(' → ');
    const numbers = legs.map((l) => (l.duty.dutyType === 'Positioning' ? `${l.duty.flightNumber ?? ''} (DH)` : l.duty.flightNumber)).filter(Boolean);
    sub = [numbers.join(' · '), ...others.map((d) => d.dutyCode)].filter(Boolean).join(' · ') || undefined;
    const block = legs.filter((l) => l.duty.dutyType === 'Flight Duty').reduce((a, l) => a + Math.round((l.on.getTime() - l.off.getTime()) / 60000), 0);
    const last = legs[legs.length - 1];
    const report = duties.find((d) => d.reportingTime);
    cells = [
      { label: 'APRES.', value: report?.reportingTime ? checkInTimeLabel(date, report.reportingTime, report.departureAirport ?? legs[0].duty.departureAirport).replace(' LT', '') : '—' },
      { label: 'BLOCO', value: block ? formatDuration(block) : '—' },
      { label: 'SETORES', value: String(legs.length) },
      { label: 'CHEGADA', value: localClock(last.on, last.duty.arrivalAirport) },
    ];
  } else {
    title = duties.map((d) => d.dutyCode).join(' · ');
    sub = main.observations ?? undefined;
    // A timed day (simulator, course, standby…): its span, like the "Hoje" activity pass.
    const timed = dayItems(date, duties, base).filter((i) => i.start && i.end);
    if (timed.length) {
      const start = timed[0].start!;
      const end = timed.reduce((m, i) => (i.end!.getTime() > m.getTime() ? i.end! : m), timed[0].end!);
      const place = timed[0].place;
      cells = [
        { label: 'INÍCIO', value: localClock(start, place) },
        { label: 'FIM', value: localClock(end, place) },
        { label: 'DURAÇÃO', value: formatDuration(Math.round((end.getTime() - start.getTime()) / 60000)) },
        { label: 'LOCAL', value: place ?? '—' },
      ];
    }
  }

  const warning = duties.find((d) => d.dayWarning)?.dayWarning;
  const badges = (
    <>
      {isToday && <PassBadge color="#1F63B5" filled>HOJE</PassBadge>}
      {change && <PassBadge color={CHANGE_STYLE[change].color} filled>{CHANGE_STYLE[change].label.toUpperCase()}</PassBadge>}
      {dayMarks(duties).map((m) => (
        <PassBadge key={m} color={isInstructorMark(m) ? '#1F63B5' : '#667085'}>{MARK_SHORT[m]}</PassBadge>
      ))}
      {warning && (
        <Tooltip title={warning}><span><PassBadge color="#C2410C" filled>⚠ VERIFICAR</PassBadge></span></Tooltip>
      )}
    </>
  );

  return (
    <PassCard
      label={`${dayLabel(date)}: ${title}`}
      onClick={onOpen}
      highlight={isToday}
      color={dutyColor(main.dutyType)}
      overline={(
        <Box component="span" display="flex" alignItems="baseline">
          <Box component="span" sx={{ minWidth: DATE_COLUMN, flexShrink: 0, color: isToday ? 'primary.main' : 'text.primary' }}>
            {dayLabel(date).toUpperCase()}
          </Box>
          <span>{dutyTypeLabel(main.dutyType).toUpperCase()}</span>
        </Box>
      )}
      badges={badges}
      title={title}
      titleSize={legs.length > 3 ? '1.1rem' : legs.length > 2 ? '1.25rem' : '1.45rem'}
      sub={sub}
      cells={cells}
    />
  );
}
