import type { ParsedDuty } from './types';
import { diffMinutes } from '../utils/duration';
import { peakQuarter, peakWindow, trailingSum, type DayAmount, type PeakQuarter, type PeakWindow } from './limitWindows';

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
    .sort((a, b) => (a.date + a.departureTime!).localeCompare(b.date + b.departureTime!));
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

// `months` calendar months before a UTC date, clamping the day to the target month's
// length (so 29 Feb − 12 months → 28 Feb, not a roll-over into March). Plain
// Date.setUTCMonth overflows on month-end dates, which skewed the 12-month FTL window.
function subMonthsUTC(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() - months;
  const target = new Date(Date.UTC(y, m, 1));
  const daysInMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), daysInMonth));
  return target;
}

function blockInRange(duties: ParsedDuty[], fromISO: string, toISO: string): number {
  return flightMinutes(duties.filter((d) => d.date >= fromISO && d.date <= toISO));
}

export interface FlightTimeTotals {
  days28: number; // trailing 28 days ending at the reference date
  months12: number; // trailing 12 months
  calendarYear: number; // 1 Jan of the reference year → reference date
}

export interface Peak28 {
  minutes: number; // flight time in the worst 28-consecutive-day window in the roster
  endDate: string | null; // the day that window ends on
}

// The heaviest 28 consecutive days ANYWHERE in the roster — past or future. EASA limits
// flight time over "any 28 consecutive days", so a trailing-to-today total can read green
// while next week's rostered flights already breach 100h. This surfaces that worst case.
// The peak window always ends on a day that has a flight, so we only test those.
export function peak28FlightTime(duties: ParsedDuty[]): Peak28 {
  const flights = operatedFlights(duties).map((f) => ({
    date: f.date,
    min: diffMinutes(f.departureTime!, f.arrivalTime!),
  }));
  if (flights.length === 0) return { minutes: 0, endDate: null };

  let best: Peak28 = { minutes: 0, endDate: flights[0].date };
  for (const end of flights) {
    const start = new Date(`${end.date}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 27);
    const startISO = isoDate(start);
    let sum = 0;
    for (const f of flights) if (f.date >= startISO && f.date <= end.date) sum += f.min;
    if (sum > best.minutes) best = { minutes: sum, endDate: end.date };
  }
  return best;
}

// Accumulated flight time in the windows that the FTL limits are measured over,
// each ending at refISO (typically "today"). These are trailing-to-date views of
// what's already been flown, which is the conservative number a crew member tracks.
export function cumulativeFlightTime(duties: ParsedDuty[], refISO: string): FlightTimeTotals {
  const ref = new Date(`${refISO}T00:00:00Z`);

  const d28 = new Date(ref);
  d28.setUTCDate(d28.getUTCDate() - 27); // 28 days inclusive of the reference day

  const m12 = subMonthsUTC(ref, 12);
  m12.setUTCDate(m12.getUTCDate() + 1); // "any 12 consecutive months" = (ref − 12 months) + 1 day

  const yearStart = `${refISO.slice(0, 4)}-01-01`;

  return {
    days28: blockInRange(duties, isoDate(d28), refISO),
    months12: blockInRange(duties, isoDate(m12), refISO),
    calendarYear: blockInRange(duties, yearStart, refISO),
  };
}

// ── Company agreement (pilots) ───────────────────────────────────────────────────────────

// RUPT cl. 30.1 — 90h per month, 270h per calendar quarter, 850h per year. The agreement's
// "month" is four consecutive weeks (cl. 6, def. 20) and its "year" 52 weeks (def. 2), so both are
// rolling windows of days. Stored as minutes.
export const AE_FLIGHT_LIMITS = {
  days28: 90 * 60,
  quarter: 270 * 60,
  year: 850 * 60,
};

// Flight time per day for the company-agreement limits: operated block time plus simulator
// sessions, which RUPT cl. 30.2 also counts as flight time (qualification courses excepted —
// the roster doesn't tell those apart, so every session counts, the cautious reading).
export function aeFlightDays(duties: ParsedDuty[]): DayAmount[] {
  const byDate = new Map<string, number>();
  const add = (date: string, min: number) => byDate.set(date, (byDate.get(date) ?? 0) + min);
  for (const f of operatedFlights(duties)) add(f.date, diffMinutes(f.departureTime!, f.arrivalTime!));
  for (const d of duties) {
    if (d.dutyType === 'Simulator' && d.departureTime && d.arrivalTime) {
      add(d.date, diffMinutes(d.departureTime, d.arrivalTime));
    }
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, minutes]) => ({ date, minutes }));
}

export interface AeFlightTotals {
  days28: PeakWindow;
  quarter: PeakQuarter;
  year: number; // the 52 weeks ending at refISO
}

// The three RUPT cl. 30 windows: the 28-day one at its worst point in the roster, the heaviest
// calendar quarter from the current one on, and the trailing 52 weeks.
export function aeFlightTime(duties: ParsedDuty[], refISO: string): AeFlightTotals {
  const days = aeFlightDays(duties);
  return {
    days28: peakWindow(days, 28),
    quarter: peakQuarter(days, refISO),
    year: trailingSum(days, refISO, 52 * 7),
  };
}
