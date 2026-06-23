import type { ParsedDuty } from '../../domain/types';
import { parseSummary } from '../shared/patterns';

// Ported from backend/src/services/icsParser.ts.
interface VEvent {
  dtstart?: string;
  dtstartTz?: string | null;
  dtend?: string;
  dtendTz?: string | null;
  summary?: string;
  description?: string;
  location?: string;
}

// The instant whose wall-clock in `tz` equals the given components, as a UTC Date.
// Uses Intl to read the zone's offset (incl. DST) at that local time. Returns null if
// the zone name is unusable, so the caller can fall back.
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date | null {
  try {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(new Date(guess))) p[part.type] = part.value;
    const asTz = Date.UTC(+p.year, +p.month - 1, +p.day, p.hour === '24' ? 0 : +p.hour, +p.minute, +p.second);
    return new Date(guess - (asTz - guess));
  } catch {
    return null;
  }
}

function fmtUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} `
    + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// Parse an iCalendar date-time to a canonical UTC "YYYY-MM-DD HH:mm:ss". The whole app
// treats schedule times as UTC, so we resolve the value's zone here: a trailing Z is
// already UTC; a TZID param is converted from that zone; a floating local time (neither)
// is assumed UTC as the app's canonical zone.
function parseICalDate(value: string, tzid?: string | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?(Z)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se, z] = m;
  const Y = +y, Mo = +mo, D = +d, H = +(h || '0'), Mi = +(mi || '0'), S = +(se || '0');
  let utc: Date | null = null;
  if (!z && tzid) utc = zonedToUtc(Y, Mo, D, H, Mi, S, tzid);
  if (!utc) utc = new Date(Date.UTC(Y, Mo - 1, D, H, Mi, S)); // Z or floating-local → UTC
  return fmtUtc(utc);
}

function parseICalDateOnly(value: string): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo}-${d}`;
}

function inferFromSummary(summary: string): string {
  const s = summary.toUpperCase();
  // Specific activities first, so a substring like "NI" in "TRAINING" or "OFF" in "DAY
  // OFF REQUEST" can't be swallowed by the generic flight check below.
  if (s.includes('STANDBY') && s.includes('HOME')) return 'Standby Home';
  if (s.includes('STANDBY')) return 'Standby Airport';
  if (s.includes('OFFICE') || s.includes('GROUND')) return 'Office Duty';
  if (s.includes('SIMULATOR') || s.includes('SIM ') || s.includes('TRN')) return 'Simulator';
  if (s.includes('TRAINING') || s.includes('TRNG')) return 'Training';
  if (s.includes('MEDICAL') || s.includes('MED ')) return 'Medical';
  if (s.includes('VACATION') || s.includes('ANNUAL')) return 'Vacation';
  if (s.includes('DAY OFF') || /\bOFF\b/.test(s)) return 'Day Off';
  if (s.includes('RESERVE') || s.includes('RSV')) return 'Reserve';
  if (s.includes('POSITIONING') || s.includes('DEADHEAD')) return 'Positioning';
  // Flight last: match a flight-number token (carrier + digits), not a bare substring,
  // so words like "FROM"/"MORNING" don't read as flights.
  if (s.includes('FLIGHT') || /\b(TP|NI|FR)\s?\d/.test(s)) return 'Flight Duty';
  return 'Other';
}

export function parseIcs(content: string): ParsedDuty[] {
  const events: VEvent[] = [];
  let current: VEvent | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
    } else if (line.startsWith('END:VEVENT')) {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      const m = line.match(/^([A-Z-]+)(;[^:]+)?:(.*)$/);
      if (!m) continue;
      const prop = m[1].replace(/-/g, '').toLowerCase();
      const tzid = m[2]?.match(/TZID=([^;:]+)/)?.[1] ?? null;
      const value = m[3];
      if (prop === 'dtstart') { current.dtstart = value; current.dtstartTz = tzid; }
      else if (prop === 'dtend') { current.dtend = value; current.dtendTz = tzid; }
      else if (prop === 'summary') current.summary = value;
      else if (prop === 'description') current.description = value;
      else if (prop === 'location') current.location = value;
    }
  }

  const duties: ParsedDuty[] = [];
  for (const ev of events) {
    const dtstart = ev.dtstart || '';
    const isAllDay = dtstart.length === 8;
    const start = isAllDay ? parseICalDateOnly(dtstart) : parseICalDate(dtstart, ev.dtstartTz);
    if (!start) continue;

    const { dutyCode, flightNumber, departureAirport, arrivalAirport } = parseSummary(ev.summary || '');
    const startFull = parseICalDate(dtstart, ev.dtstartTz);
    const endFull = parseICalDate(ev.dtend || '', ev.dtendTz);

    duties.push({
      date: start.split(' ')[0],
      dutyCode: dutyCode === 'UNK' ? (flightNumber ? 'FLT' : 'UNK') : dutyCode,
      dutyType: inferFromSummary(ev.summary || ''),
      // All time fields must be "HH:mm" — downstream block/rest/FTL math splits on ":".
      // Storing the full "YYYY-MM-DD HH:mm:ss" here corrupted every time calculation.
      reportingTime: isAllDay ? null : startFull?.split(' ')[1]?.slice(0, 5) || null,
      departureTime: isAllDay ? null : startFull?.split(' ')[1]?.slice(0, 5) || null,
      arrivalTime: isAllDay ? null : endFull?.split(' ')[1]?.slice(0, 5) || null,
      flightNumber,
      departureAirport: departureAirport || (ev.location || null),
      arrivalAirport,
      aircraftType: null,
      observations: ev.description || null,
    });
  }
  return duties;
}
