import { ParsedDuty } from './csvParser';

interface VEvent {
  uid?: string;
  dtstart?: string;
  dtend?: string;
  summary?: string;
  description?: string;
  location?: string;
}

function parseICalDate(value: string): string | null {
  // Handle 20240615T060000Z format
  if (!value) return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const h = hour || '00';
  const m = minute || '00';
  return `${year}-${month}-${day} ${h}:${m}:00`;
}

function parseICalDateOnly(value: string): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

function inferDutyType(summary: string): string {
  const s = summary.toUpperCase();
  if (s.includes('FLIGHT') || s.includes('TP') || s.includes('FR')) return 'Flight Duty';
  if (s.includes('STANDBY') && s.includes('AIRPORT')) return 'Standby Airport';
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

function parseSummary(summary: string): {
  dutyCode: string;
  flightNumber: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
} {
  // Common patterns: "FLT TP1920 LIS-OPO" or "Flight Duty TP1920 LIS-OPO"
  const parts = summary.split(' ');
  let dutyCode = 'UNK';
  let flightNumber: string | null = null;
  let departureAirport: string | null = null;
  let arrivalAirport: string | null = null;

  for (const part of parts) {
    const routeMatch = part.match(/^([A-Z]{3})-([A-Z]{3})$/);
    if (routeMatch) {
      departureAirport = routeMatch[1];
      arrivalAirport = routeMatch[2];
      continue;
    }
    const flightMatch = part.match(/^([A-Z0-9]{2}\d{1,4}[A-Z]?)$/i);
    if (flightMatch) {
      flightNumber = flightMatch[1].toUpperCase();
      continue;
    }
    const codeMatch = part.match(/^([A-Z]{2,5})$/);
    if (codeMatch) {
      dutyCode = codeMatch[1].toUpperCase();
    }
  }

  return { dutyCode, flightNumber, departureAirport, arrivalAirport };
}

export async function parseICS(content: string): Promise<ParsedDuty[]> {
  const events: VEvent[] = [];
  const lines = content.split(/\r?\n/);

  let currentEvent: VEvent | null = null;
  let inEvent = false;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      currentEvent = {};
      inEvent = true;
    } else if (line.startsWith('END:VEVENT')) {
      if (currentEvent) {
        events.push(currentEvent);
      }
      currentEvent = null;
      inEvent = false;
    } else if (inEvent && currentEvent) {
      const propMatch = line.match(/^([A-Z-]+)(;[^:]+)?:(.*)$/);
      if (propMatch) {
        const [, prop, , value] = propMatch;
        const cleanProp = prop.replace(/-/g, '').toLowerCase();
        switch (cleanProp) {
          case 'uid':
            currentEvent.uid = value;
            break;
          case 'dtstart':
            currentEvent.dtstart = value;
            break;
          case 'dtend':
            currentEvent.dtend = value;
            break;
          case 'summary':
            currentEvent.summary = value;
            break;
          case 'description':
            currentEvent.description = value;
            break;
          case 'location':
            currentEvent.location = value;
            break;
        }
      }
    }
  }

  const duties: ParsedDuty[] = [];

  for (const event of events) {
    const dtstart = event.dtstart || '';
    const isAllDay = dtstart.length === 8;

    const date = isAllDay ? parseICalDateOnly(dtstart) : parseICalDate(dtstart);
    if (!date) continue;

    const { dutyCode, flightNumber, departureAirport, arrivalAirport } = parseSummary(
      event.summary || ''
    );

    duties.push({
      date: date.split(' ')[0],
      dutyCode,
      dutyType: inferDutyType(event.summary || ''),
      reportingTime: isAllDay ? null : dtstart.includes('T') ? parseICalDate(dtstart)?.split(' ')[1] || null : null,
      departureTime: parseICalDate(dtstart),
      arrivalTime: parseICalDate(event.dtend || ''),
      flightNumber,
      departureAirport,
      arrivalAirport,
      aircraftType: null,
      observations: event.description || null,
    });
  }

  return duties;
}
