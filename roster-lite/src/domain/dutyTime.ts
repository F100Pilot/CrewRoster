import type { ParsedDuty } from './types';

// EASA ORO.FTL.210 cumulative DUTY limits — the companion to the flight-time caps in
// flightTime.ts. Unlike a company agreement these figures come from the regulation
// itself, so they hold for any EASA operator; an operator's approved scheme may be
// more restrictive, never less. Stored as minutes.
export const DUTY_LIMITS = {
  days7: 60 * 60, // 60h in any 7 consecutive days
  days14: 110 * 60, // 110h in any 14 consecutive days
  days28: 190 * 60, // 190h in any 28 consecutive days
};

// How much of a rostered day counts towards the cumulative totals. Real work counts in
// full. Standby at home (and reserve) counts only in part: ORO.FTL.225 leaves the exact
// share to the operator's approved scheme, and 25% is the usual figure — this is the one
// number here that a given airline may define differently.
export const HOME_STANDBY_FACTOR = 0.25;

// Types that are not duty at all, so they never open a duty period.
const FREE = new Set(['Day Off', 'Vacation', 'Absence']);
// Types that count only at HOME_STANDBY_FACTOR when they are the whole of the day.
const PARTIAL = new Set(['Standby Home', 'Reserve']);
// Everything else — including 'Other' — counts in full: for a panel that warns about
// limits, over-counting an unrecognised code is the safer way to be wrong.

export interface DutyDay {
  date: string;
  minutes: number; // counted duty minutes (already weighted)
  span: number; // the raw rostered span, before weighting
  partial: boolean; // the day was home standby / reserve only
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export interface DutyWindow {
  start: Date;
  end: Date;
  span: number; // minutes on duty
}

// The clock window a day's duties occupy, as real instants.
//
// Roster times are clock times with no date, so a duty running past midnight has its
// arrival read as a SMALLER number than its report. Comparing them directly (or as
// text) would collapse such a day to minutes and, where the window is used for rest,
// overstate the rest that follows. Instead we treat the day's times as points on a
// 24-hour circle and take the shortest arc covering them all: each start is tried as the
// opening of the duty and the smallest resulting span wins, which needs no assumption
// about the order the duties arrive in. The end is then the start plus that span, rolled
// into the next day when the duty crossed midnight.
//
// Returns null when the day has no timed duty at all.
export function dutyWindow(date: string, duties: ParsedDuty[]): DutyWindow | null {
  const starts: string[] = [];
  const ends: string[] = [];
  for (const d of duties) {
    if (d.reportingTime) starts.push(d.reportingTime);
    if (d.departureTime) {
      starts.push(d.departureTime);
      ends.push(d.departureTime);
    }
    if (d.arrivalTime) ends.push(d.arrivalTime);
  }
  if (starts.length === 0 || ends.length === 0) return null;

  const times = [...starts, ...ends].map(toMinutes);
  let span = Infinity;
  let open = toMinutes(starts[0]);
  for (const candidate of starts.map(toMinutes)) {
    let widest = 0;
    for (const t of times) widest = Math.max(widest, (t - candidate + 1440) % 1440);
    if (widest < span) { span = widest; open = candidate; }
  }

  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCMinutes(start.getUTCMinutes() + open);
  return { start, end: new Date(start.getTime() + span * 60000), span };
}

// The counted duty of a single day: the duty window, weighted by how much of it counts.
// Turnarounds between sectors fall inside the window, as they should. Returns null for a
// day with no timed duty — a day off, or a duty the parser couldn't time.
function dutyDay(date: string, duties: ParsedDuty[]): DutyDay | null {
  const counted = duties.filter((d) => !FREE.has(d.dutyType));
  const window = dutyWindow(date, counted);
  if (!window) return null;
  const { span } = window;

  // Only a day made up entirely of home standby gets the reduced share; a standby that
  // turned into a flight is a normal duty day.
  const partial = counted.every((d) => PARTIAL.has(d.dutyType));
  return { date, span, partial, minutes: partial ? Math.round(span * HOME_STANDBY_FACTOR) : span };
}

// Counted duty per day across the roster, in date order. Days without timed duty are
// left out entirely, so the windows below only ever sum real duty.
export function dutyDays(duties: ParsedDuty[]): DutyDay[] {
  const byDate = new Map<string, ParsedDuty[]>();
  for (const d of duties) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date)!.push(d);
  }
  const out: DutyDay[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const day = dutyDay(date, byDate.get(date)!);
    if (day) out.push(day);
  }
  return out;
}

export interface PeakWindow {
  minutes: number;
  endDate: string | null; // the day the worst window ends on
}

// The heaviest `span` consecutive days ANYWHERE in the roster — past or future. EASA
// limits duty over "any N consecutive days", so a trailing-to-today total can read green
// while next week's roster already breaches the cap. The worst window always ends on a
// day that has duty, so only those need testing.
export function peakDutyWindow(days: DutyDay[], span: number): PeakWindow {
  if (days.length === 0) return { minutes: 0, endDate: null };
  let best: PeakWindow = { minutes: 0, endDate: days[0].date };
  for (const end of days) {
    const from = new Date(`${end.date}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - (span - 1));
    const fromISO = from.toISOString().slice(0, 10);
    let sum = 0;
    for (const d of days) if (d.date >= fromISO && d.date <= end.date) sum += d.minutes;
    if (sum > best.minutes) best = { minutes: sum, endDate: end.date };
  }
  return best;
}

export interface DutyTotals {
  days7: PeakWindow;
  days14: PeakWindow;
  days28: PeakWindow;
}

// The three ORO.FTL.210 windows at their worst point in the roster.
export function peakDutyTime(duties: ParsedDuty[]): DutyTotals {
  const days = dutyDays(duties);
  return {
    days7: peakDutyWindow(days, 7),
    days14: peakDutyWindow(days, 14),
    days28: peakDutyWindow(days, 28),
  };
}
