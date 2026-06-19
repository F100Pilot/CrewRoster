import type { ParsedDuty } from './types';
import { diffMinutes } from '../utils/duration';

// EASA ORO.FTL flight-time limits (apply to both flight and cabin crew). Stored as
// minutes. These are the headline rolling/period caps a crew member watches.
export const FTL_LIMITS = {
  days28: 100 * 60, // 100h in any 28 consecutive days
  months12: 1000 * 60, // 1000h in any 12 consecutive months
  calendarYear: 900 * 60, // 900h in a calendar year
};

// Operated sectors only — actual flying with both endpoints timed. Positioning
// (deadhead) is duty time but NOT flight time, so it's excluded from FTL totals
// and from the logbook.
export function operatedFlights(duties: ParsedDuty[]): ParsedDuty[] {
  return duties
    .filter((d) => d.dutyType === 'Flight Duty' && d.departureTime && d.arrivalTime)
    .sort((a, b) => (a.date + a.departureTime! < b.date + b.departureTime! ? -1 : 1));
}

// Total block (flight) minutes across the given duties — operated sectors only.
export function flightMinutes(duties: ParsedDuty[]): number {
  return operatedFlights(duties).reduce(
    (sum, f) => sum + diffMinutes(f.departureTime!, f.arrivalTime!),
    0
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function blockInRange(duties: ParsedDuty[], fromISO: string, toISO: string): number {
  return flightMinutes(duties.filter((d) => d.date >= fromISO && d.date <= toISO));
}

export interface FlightTimeTotals {
  days28: number; // trailing 28 days ending at the reference date
  months12: number; // trailing 12 months
  calendarYear: number; // 1 Jan of the reference year → reference date
}

// Accumulated flight time in the windows that the FTL limits are measured over,
// each ending at refISO (typically "today"). These are trailing-to-date views of
// what's already been flown, which is the conservative number a crew member tracks.
export function cumulativeFlightTime(duties: ParsedDuty[], refISO: string): FlightTimeTotals {
  const ref = new Date(`${refISO}T00:00:00Z`);

  const d28 = new Date(ref);
  d28.setUTCDate(d28.getUTCDate() - 27); // 28 days inclusive of the reference day

  const m12 = new Date(ref);
  m12.setUTCMonth(m12.getUTCMonth() - 12);
  m12.setUTCDate(m12.getUTCDate() + 1); // 12 months inclusive

  const yearStart = `${refISO.slice(0, 4)}-01-01`;

  return {
    days28: blockInRange(duties, isoDate(d28), refISO),
    months12: blockInRange(duties, isoDate(m12), refISO),
    calendarYear: blockInRange(duties, yearStart, refISO),
  };
}
