// Build an iCalendar (.ics) feed from a parsed roster so it can be imported into
// Google / Apple / Outlook calendars. All flight times are UTC; timed events are
// emitted in UTC (Z) and the calendar app renders them in the user's local zone.
import { addDays, format, parseISO } from 'date-fns';
import type { ParsedDuty, Roster } from '../domain/types';
import { diffMinutes } from './duration';
import { getCheckinLeadMinutes } from '../storage/settings';
import { checkInTimeLabel } from './localTime';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// RFC 5545 text escaping for SUMMARY/DESCRIPTION/LOCATION values.
function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsDate(dateISO: string): string {
  return dateISO.replace(/-/g, ''); // YYYYMMDD
}

function summaryFor(d: ParsedDuty): string {
  if (d.flightNumber) {
    const route = d.departureAirport ? ` ${d.departureAirport}-${d.arrivalAirport ?? ''}` : '';
    return `${d.flightNumber}${route}`;
  }
  return `${d.dutyCode} (${d.dutyType})`;
}

// Total minutes before DTSTART (departure) at which the check-in alarm should fire:
// lead minutes before the report time, accounting for the gap from report to departure.
// Returns null when no alarm applies (lead off, or no timed start).
export function alarmLeadMinutes(d: ParsedDuty, leadMin: number): number | null {
  if (leadMin <= 0 || !d.departureTime) return null;
  const reportToDep = d.reportingTime ? diffMinutes(d.reportingTime, d.departureTime) : 0;
  // Guard against a malformed report time that lands after departure.
  const gap = reportToDep >= 0 && reportToDep < 24 * 60 ? reportToDep : 0;
  return gap + leadMin;
}

// One calendar event per duty, in a neutral shape shared by the .ics export, the month share
// and the Google Calendar sync — so all three say the same thing. `key` is stable across roster
// refreshes (day + flight/code + its order among equal ones), unlike the duty's index, so a sync can
// update an event in place instead of deleting and recreating it.
export interface RosterEvent {
  key: string;
  date: string;
  allDay: boolean;
  start: string; // ISO UTC instant ('2026-06-20T06:15:00Z'), or the date for an all-day event
  end: string; // exclusive: the next day for an all-day event
  summary: string;
  location: string | null;
  description: string | null;
  alarmMinutes: number | null; // before `start`
  alarmText: string | null;
}

const nextDay = (dateISO: string) => format(addDays(parseISO(dateISO), 1), 'yyyy-MM-dd');
const utcInstant = (dateISO: string, hhmm: string) => {
  const [h, m] = hhmm.split(':');
  return `${dateISO}T${pad(+h)}:${pad(+m)}:00Z`;
};

export function rosterEvents(duties: ParsedDuty[], leadMin: number): RosterEvent[] {
  const seen = new Map<string, number>();
  return duties.map((d) => {
    const base = `${d.date}|${d.flightNumber ?? d.dutyCode}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const timed = !!(d.departureTime && d.arrivalTime);
    const desc: string[] = [];
    if (d.reportingTime) desc.push(`Check-in ${checkInTimeLabel(d.date, d.reportingTime, d.departureAirport)}`);
    if (d.aircraftType) desc.push(d.aircraftType);
    if (d.observations) desc.push(d.observations);
    const alarmMinutes = alarmLeadMinutes(d, leadMin);
    return {
      key: `${base}|${n}`,
      date: d.date,
      allDay: !timed,
      // Timed event (flight, training, simulator). Arrival before departure = next day.
      start: timed ? utcInstant(d.date, d.departureTime!) : d.date,
      end: timed ? utcInstant(d.arrivalTime! < d.departureTime! ? nextDay(d.date) : d.date, d.arrivalTime!) : nextDay(d.date),
      summary: summaryFor(d),
      location: d.departureAirport,
      description: desc.length ? desc.join(' · ') : null,
      alarmMinutes,
      alarmText: alarmMinutes === null ? null : d.reportingTime
        ? `Check-in ${checkInTimeLabel(d.date, d.reportingTime, d.departureAirport)} — ${summaryFor(d)}`
        : `Voo ${summaryFor(d)}`,
    };
  });
}

const icsStamp = (iso: string) => iso.replace(/[-:]/g, ''); // 2026-06-20T06:15:00Z → 20260620T061500Z

function eventLines(e: RosterEvent, stamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.key.replace(/\|/g, '-')}@crewroster-lite`, `DTSTAMP:${stamp}`];
  if (e.allDay) {
    // All-day event (day off, vacation, standby with no block, …).
    lines.push(`DTSTART;VALUE=DATE:${icsDate(e.start)}`, `DTEND;VALUE=DATE:${icsDate(e.end)}`);
  } else {
    lines.push(`DTSTART:${icsStamp(e.start)}`, `DTEND:${icsStamp(e.end)}`);
  }
  lines.push(`SUMMARY:${esc(e.summary)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  // Check-in reminder: a display alarm a configurable time before the report/departure.
  if (e.alarmMinutes !== null) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${e.alarmMinutes}M`, `DESCRIPTION:${esc(e.alarmText ?? '')}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

// An iCalendar text for these duties (the whole roster, or one month to share).
export function buildIcsFor(duties: ParsedDuty[], calName = 'CrewRoster'): string {
  const stamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
  const body = rosterEvents(duties, getCheckinLeadMinutes()).flatMap((e) => eventLines(e, stamp));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CrewRoster Lite//PT//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`,
    ...body,
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export function buildIcs(roster: Roster): string {
  return buildIcsFor(roster.duties);
}

// Trigger a download of the roster as a .ics file in the browser.
export function downloadIcs(roster: Roster): void {
  const blob = new Blob([buildIcs(roster)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `crewroster-${roster.fileName.replace(/\.[^.]+$/, '') || 'escala'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
