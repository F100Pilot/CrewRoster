import type { CrewRole, ParsedDuty } from './types';
import { peakQuarter, peakWindow, trailingSum, type DayAmount, type PeakQuarter, type PeakWindow } from './limitWindows';
import { standbyWindowUtc } from './standbyWindows';

export type { PeakWindow } from './limitWindows';

// Cumulative DUTY time, the companion to the flight-time caps in flightTime.ts. Two rule sets:
//
// • Pilots — the Portugália / SIPLA company agreement (AE), Regulamento de Utilização e
//   Prestação de Trabalho (RUPT). Stricter than EASA on every window, so it is the one to watch.
// • Cabin crew — the generic EASA ORO.FTL figures. The SIPLA agreement covers pilots only, and
//   the cabin agreement isn't modelled here.

// RUPT cl. 31.1 — 50h in any 7 consecutive days, 180h in any 28, 480h per calendar quarter,
// 1800h per year. A "year" is 52 consecutive weeks (cl. 6, def. 2). Stored as minutes.
export const AE_DUTY_LIMITS = {
  days7: 50 * 60,
  days28: 180 * 60,
  quarter: 480 * 60,
  year: 1800 * 60,
};

// EASA ORO.FTL.210 — 60h in any 7 consecutive days, 110h in any 14, 190h in any 28.
export const DUTY_LIMITS = {
  days7: 60 * 60,
  days14: 110 * 60,
  days28: 190 * 60,
};

// How a rule set counts a day.
export interface DutyRules {
  // Share of a standby / reserve duty that counts towards the cumulative limits (0–1).
  standbyShare(d: ParsedDuty): number;
  // Minutes still on duty after the last operated sector's on-blocks (debriefing).
  debriefMin: number;
}

// The usual EASA share for standby at home; ORO.FTL.225 leaves it to the operator's scheme.
export const HOME_STANDBY_FACTOR = 0.25;

// RUPT: standby at home counts 25% towards the weekly, monthly, quarterly and annual limits
// (cl. 19.7 b) — all the windows here; standby at the company's premises (airport) 50% (cl. 19.7 a);
// the 24-hour reserve doesn't count for any limit (cl. 20.4). The flight duty runs until 30 min
// after the aircraft's final stop (cl. 6, def. 42).
export const PGA_PILOT_RULES: DutyRules = {
  standbyShare: (d) => {
    if (d.dutyType === 'Reserve' || d.dutyCode.toUpperCase() === 'R24') return 0;
    if (d.dutyType === 'Standby Airport') return 0.5;
    return HOME_STANDBY_FACTOR;
  },
  debriefMin: 30,
};

// Generic EASA counting, kept as it was before the company agreement was modelled: standby at
// home and reserve at the usual 25%, airport standby in full, the day ending at on-blocks.
export const EASA_RULES: DutyRules = {
  standbyShare: (d) => (d.dutyType === 'Standby Airport' ? 1 : HOME_STANDBY_FACTOR),
  debriefMin: 0,
};

export const dutyRulesFor = (role: CrewRole | undefined): DutyRules =>
  role === 'cabin' ? EASA_RULES : PGA_PILOT_RULES;

// Types that are not duty at all, so they never open a duty period.
const FREE = new Set(['Day Off', 'Vacation', 'Absence']);
// Types counted at a share of their duration (rules.standbyShare) rather than as work.
const STANDBY = new Set(['Standby Home', 'Standby Airport', 'Reserve']);
// Everything else — including 'Other' — is work and counts in full: for a panel that warns
// about limits, over-counting an unrecognised code is the safer way to be wrong.

export const isStandby = (d: ParsedDuty): boolean => STANDBY.has(d.dutyType);

export interface DutyDay {
  date: string;
  minutes: number; // counted duty minutes (already weighted)
  span: number; // the raw rostered time on duty, before weighting
  partial: boolean; // the day was standby / reserve only
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export interface DutyWindow {
  start: Date;
  end: Date;
  span: number; // minutes on duty
  // Minutes after midnight UTC of the day at which the window opens; place a clock time on the
  // window with (toMinutes(t) - open + 1440) % 1440.
  open: number;
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
  return { start, end: new Date(start.getTime() + span * 60000), span, open };
}

// The day's WORK window (standby, reserve and free days left out) under a rule set: the duty
// window, extended by the debriefing when it ends on an operated sector. Used for the duty
// limits and for the rest that follows the day.
export function workWindow(date: string, duties: ParsedDuty[], rules: DutyRules): DutyWindow | null {
  const work = duties.filter((d) => !FREE.has(d.dutyType) && !STANDBY.has(d.dutyType));
  const w = dutyWindow(date, work);
  if (!w || rules.debriefMin === 0) return w;
  const at = (t: string) => (toMinutes(t) - w.open + 1440) % 1440;
  const endsOnSector = work.some((d) => d.dutyType === 'Flight Duty' && d.arrivalTime && at(d.arrivalTime) === w.span);
  if (!endsOnSector) return w;
  const span = w.span + rules.debriefMin;
  return { ...w, span, end: new Date(w.start.getTime() + span * 60000) };
}

// A standby duty's own window in UTC — start and length — or null when it can't be timed. Times
// the roster printed win; otherwise the code's window from the DOV table (the grid usually shows
// no end for a standby).
function standbySlot(d: ParsedDuty): { start: string | null; minutes: number } | null {
  if (d.departureTime && d.arrivalTime) {
    return { start: d.departureTime, minutes: (toMinutes(d.arrivalTime) - toMinutes(d.departureTime) + 1440) % 1440 };
  }
  const known = standbyWindowUtc(d.dutyCode, d.date);
  if (!known) return null;
  return { start: d.reportingTime ?? d.departureTime ?? known.start, minutes: known.minutes };
}

// A standby's occupied interval as real instants, or null when it can't be timed. Used where a
// standby must be placed on the clock (the weekly-rest check), not only measured.
export function standbyInterval(d: ParsedDuty): { start: Date; end: Date } | null {
  const slot = standbySlot(d);
  if (!slot?.start) return null;
  const start = new Date(`${d.date}T${slot.start}:00Z`);
  return { start, end: new Date(start.getTime() + slot.minutes * 60000) };
}

// The counted duty of a single day: the work window in full, plus each standby at its share.
// A standby that ran into a call-out stops counting where the work begins (RUPT cl. 19.4: it
// ends at the report time), so the overlap is counted once, as work. Returns null for a day with
// nothing countable — a day off, or a duty the parser couldn't time.
// On a day with no flying — only training, simulator, office or medical work — the time between
// sessions (a lunch break between FP1 and FP2, say) is not duty: each activity is logged with its
// own start and end (RRRGS cl. 12.1 a), and duty is the time spent working or available for it
// (RUPT cl. 6, def. 46). So such a day counts the union of its timed sessions, not the span from
// the first start to the last end. A day that includes flying keeps the span: the ground time
// between sectors is part of the flight duty. Null when no session on the day has both times.
const FLYING = new Set(['Flight Duty', 'Positioning']);
function groundSessionsMinutes(work: ParsedDuty[], w: DutyWindow): number | null {
  if (work.some((d) => FLYING.has(d.dutyType))) return null;
  const at = (t: string) => (toMinutes(t) - w.open + 1440) % 1440;
  const sessions = work
    .filter((d) => d.departureTime && d.arrivalTime)
    .map((d) => {
      const from = at(d.departureTime!);
      return [from, from + ((toMinutes(d.arrivalTime!) - toMinutes(d.departureTime!) + 1440) % 1440)] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  if (sessions.length === 0) return null;
  // Union, so overlapping or repeated sessions count once.
  let total = 0;
  let [curFrom, curTo] = sessions[0];
  for (const [from, to] of sessions.slice(1)) {
    if (from <= curTo) curTo = Math.max(curTo, to);
    else { total += curTo - curFrom; [curFrom, curTo] = [from, to]; }
  }
  return total + (curTo - curFrom);
}

function dutyDay(date: string, duties: ParsedDuty[], rules: DutyRules): DutyDay | null {
  const w = workWindow(date, duties, rules);
  const work = duties.filter((d) => !FREE.has(d.dutyType) && !STANDBY.has(d.dutyType));
  let span = w ? groundSessionsMinutes(work, w) ?? w.span : 0;
  let minutes = span;
  let anyStandby = false;

  for (const d of duties.filter(isStandby)) {
    const slot = standbySlot(d);
    if (!slot) continue;
    let own = slot.minutes;
    if (w && slot.start) {
      // Place the standby on the work window's line; a start "before" the window is negative.
      const s = ((toMinutes(slot.start) - w.open + 1440 + 720) % 1440) - 720;
      const overlap = Math.max(0, Math.min(s + slot.minutes, w.span) - Math.max(s, 0));
      own -= overlap;
    }
    anyStandby = true;
    span += own;
    minutes += own * rules.standbyShare(d);
  }

  if (!w && !anyStandby) return null;
  return { date, span, minutes: Math.round(minutes), partial: !w };
}

// Counted duty per day across the roster, in date order. Days without anything countable are
// left out entirely, so the windows below only ever sum real duty.
export function dutyDays(duties: ParsedDuty[], rules: DutyRules = EASA_RULES): DutyDay[] {
  const byDate = new Map<string, ParsedDuty[]>();
  for (const d of duties) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date)!.push(d);
  }
  const out: DutyDay[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const day = dutyDay(date, byDate.get(date)!, rules);
    if (day) out.push(day);
  }
  return out;
}

// The heaviest `span` consecutive days anywhere in the roster.
export function peakDutyWindow(days: DayAmount[], span: number): PeakWindow {
  return peakWindow(days, span);
}

export interface DutyTotals {
  days7: PeakWindow;
  days14: PeakWindow;
  days28: PeakWindow;
}

// The three EASA ORO.FTL.210 windows at their worst point in the roster.
export function peakDutyTime(duties: ParsedDuty[], rules: DutyRules = EASA_RULES): DutyTotals {
  const days = dutyDays(duties, rules);
  return {
    days7: peakWindow(days, 7),
    days14: peakWindow(days, 14),
    days28: peakWindow(days, 28),
  };
}

export interface AeDutyTotals {
  days7: PeakWindow;
  days28: PeakWindow;
  quarter: PeakQuarter;
  year: number; // the 52 weeks ending at refISO
}

// The four RUPT cl. 31 windows: the 7- and 28-day ones at their worst point in the roster, the
// heaviest calendar quarter from the current one on, and the trailing 52 weeks.
export function aeDutyTime(duties: ParsedDuty[], refISO: string): AeDutyTotals {
  const days = dutyDays(duties, PGA_PILOT_RULES);
  return {
    days7: peakWindow(days, 7),
    days28: peakWindow(days, 28),
    quarter: peakQuarter(days, refISO),
    year: trailingSum(days, refISO, 52 * 7),
  };
}
