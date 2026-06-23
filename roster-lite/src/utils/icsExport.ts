// Build an iCalendar (.ics) feed from a parsed roster so it can be imported into
// Google / Apple / Outlook calendars. All flight times are UTC; timed events are
// emitted in UTC (Z) and the calendar app renders them in the user's local zone.
import { addDays, format, parseISO } from 'date-fns';
import type { ParsedDuty, Roster } from '../domain/types';
import { diffMinutes } from './duration';
import { getCheckinLeadMinutes } from '../storage/settings';

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

function icsUtc(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(':');
  return `${icsDate(dateISO)}T${pad(+h)}${pad(+m)}00Z`;
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

function eventLines(d: ParsedDuty, idx: number, stamp: string, leadMin: number): string[] {
  const uid = `${d.date}-${idx}-${d.dutyCode}@crewroster-lite`;
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`];

  if (d.departureTime && d.arrivalTime) {
    // Timed event (flight, training, simulator). Arrival before departure = next day.
    const endDate = d.arrivalTime < d.departureTime ? format(addDays(parseISO(d.date), 1), 'yyyy-MM-dd') : d.date;
    lines.push(`DTSTART:${icsUtc(d.date, d.departureTime)}`);
    lines.push(`DTEND:${icsUtc(endDate, d.arrivalTime)}`);
  } else {
    // All-day event (day off, vacation, standby with no block, …).
    lines.push(`DTSTART;VALUE=DATE:${icsDate(d.date)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(format(addDays(parseISO(d.date), 1), 'yyyy-MM-dd'))}`);
  }

  lines.push(`SUMMARY:${esc(summaryFor(d))}`);
  if (d.departureAirport) lines.push(`LOCATION:${esc(d.departureAirport)}`);

  const desc: string[] = [];
  if (d.reportingTime) desc.push(`Check-in ${d.reportingTime}z`);
  if (d.aircraftType) desc.push(d.aircraftType);
  if (d.observations) desc.push(d.observations);
  if (desc.length) lines.push(`DESCRIPTION:${esc(desc.join(' · '))}`);

  // Check-in reminder: a display alarm a configurable time before the report/departure.
  const lead = alarmLeadMinutes(d, leadMin);
  if (lead !== null) {
    const label = d.reportingTime ? `Check-in ${d.reportingTime}z — ${summaryFor(d)}` : `Voo ${summaryFor(d)}`;
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:-PT${lead}M`,
      `DESCRIPTION:${esc(label)}`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT');
  return lines;
}

export function buildIcs(roster: Roster): string {
  const stamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");
  const leadMin = getCheckinLeadMinutes();
  const body = roster.duties.flatMap((d, i) => eventLines(d, i, stamp, leadMin));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CrewRoster Lite//PT//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:CrewRoster',
    ...body,
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
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
