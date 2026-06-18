import type { ParsedDuty } from '../../domain/types';
import { parseSummary } from '../shared/patterns';

// Ported from backend/src/services/icsParser.ts.
interface VEvent {
  dtstart?: string;
  dtend?: string;
  summary?: string;
  description?: string;
  location?: string;
}

function parseICalDate(value: string): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo}-${d} ${h || '00'}:${mi || '00'}:00`;
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
  if (s.includes('FLIGHT') || s.includes('TP') || s.includes('NI') || s.includes('FR')) return 'Flight Duty';
  if (s.includes('STANDBY') && s.includes('HOME')) return 'Standby Home';
  if (s.includes('STANDBY')) return 'Standby Airport';
  if (s.includes('OFFICE') || s.includes('GROUND')) return 'Office Duty';
  if (s.includes('SIMULATOR') || s.includes('SIM ') || s.includes('TRN')) return 'Simulator';
  if (s.includes('TRAINING') || s.includes('TRNG')) return 'Training';
  if (s.includes('MEDICAL') || s.includes('MED ')) return 'Medical';
  if (s.includes('VACATION') || s.includes('ANNUAL')) return 'Vacation';
  if (s.includes('DAY OFF') || s.includes('OFF')) return 'Day Off';
  if (s.includes('RESERVE') || s.includes('RSV')) return 'Reserve';
  if (s.includes('POSITIONING') || s.includes('DEADHEAD')) return 'Positioning';
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
      const value = m[3];
      if (prop === 'dtstart') current.dtstart = value;
      else if (prop === 'dtend') current.dtend = value;
      else if (prop === 'summary') current.summary = value;
      else if (prop === 'description') current.description = value;
      else if (prop === 'location') current.location = value;
    }
  }

  const duties: ParsedDuty[] = [];
  for (const ev of events) {
    const dtstart = ev.dtstart || '';
    const isAllDay = dtstart.length === 8;
    const start = isAllDay ? parseICalDateOnly(dtstart) : parseICalDate(dtstart);
    if (!start) continue;

    const { dutyCode, flightNumber, departureAirport, arrivalAirport } = parseSummary(ev.summary || '');
    const startFull = parseICalDate(dtstart);
    const endFull = parseICalDate(ev.dtend || '');

    duties.push({
      date: start.split(' ')[0],
      dutyCode: dutyCode === 'UNK' ? (flightNumber ? 'FLT' : 'UNK') : dutyCode,
      dutyType: inferFromSummary(ev.summary || ''),
      reportingTime: isAllDay ? null : startFull?.split(' ')[1]?.slice(0, 5) || null,
      departureTime: startFull,
      arrivalTime: endFull,
      flightNumber,
      departureAirport: departureAirport || (ev.location || null),
      arrivalAirport,
      aircraftType: null,
      observations: ev.description || null,
    });
  }
  return duties;
}
