import type { CrewRole, ParsedDuty } from './types';
import { dutyWindow, workWindow, PGA_PILOT_RULES } from './dutyTime';
import { HOME_BASE } from './dutyStats';
import { lisbonLocalToUtc } from './standbyWindows';

// Rest between consecutive duty periods. A "duty period" is one calendar day that has at least
// one timed duty; rest before a period is the gap from the previous period's end to its start.
//
// Two rule sets, as for the duty limits (dutyTime.ts):
// • Pilots — the company agreement (RUPT cl. 25 and 34). The period is the WORK window (standby
//   left out) and runs until 30 min after the last on-blocks. The minimum rest is 12h at base
//   (9h at base before ground work that follows flying) and 10h away, or the length of the
//   preceding duty when that is longer; plus 2h when that duty touched 02:00–05:59 Lisbon time.
// • Cabin crew — a flat 12h heads-up, with the period spanning every timed duty of the day.
//
// Indicative only: irregularities, the captain's discretion and night-stop exceptions (cl. 25.3,
// 36) can lawfully shorten a rest, and the roster can't show those.
export const MIN_REST_MINUTES = 12 * 60;

export interface RestInfo {
  date: string;
  restMinutes: number | null; // null for the first period or when it can't be computed
  requiredMinutes: number; // the minimum that applied
  away: boolean; // the rest was taken away from base
  short: boolean; // below the minimum
}

interface Period {
  date: string;
  start: Date;
  end: Date;
  duties: ParsedDuty[];
}

const MIN = 60000;
const isFlying = (d: ParsedDuty) =>
  d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning' || d.dutyType === 'Simulator';

// Where the period ends: the arrival airport of its last leg, or null when it ends on the ground
// (simulator, office…), which happens at base.
function endAirport(p: Period): string | null {
  const legs = p.duties.filter((d) => d.arrivalAirport && d.arrivalTime);
  if (legs.length === 0) return null;
  const open = p.start.getUTCHours() * 60 + p.start.getUTCMinutes();
  const at = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h * 60 + m - open + 1440) % 1440;
  };
  return legs.reduce((a, b) => (at(b.arrivalTime!) >= at(a.arrivalTime!) ? b : a)).arrivalAirport!.toUpperCase();
}

// Whether flying or simulator work in the period touched 02:00–05:59 Lisbon time (RUPT cl. 34.2),
// on its own day or the next (a period that runs past midnight).
function touchesCriticalWindow(p: Period): boolean {
  if (!p.duties.some(isFlying)) return false;
  for (const offset of [0, 1]) {
    const d = new Date(`${p.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    const iso = d.toISOString().slice(0, 10);
    const from = new Date(`${iso}T${lisbonLocalToUtc(iso, '02:00')}:00Z`).getTime();
    const to = from + 4 * 60 * MIN; // until 05:59:59
    if (p.start.getTime() < to && p.end.getTime() > from) return true;
  }
  return false;
}

// The minimum rest owed before `next`, after `prev`, under the company agreement.
function aeRequiredRest(prev: Period, next: Period): { required: number; away: boolean } {
  const where = endAirport(prev);
  const away = !!where && where !== HOME_BASE;
  const groundNext = !next.duties.some(isFlying);
  const floor = away ? 10 * 60 : prev.duties.some(isFlying) && groundNext ? 9 * 60 : 12 * 60;
  const prevSpan = Math.round((prev.end.getTime() - prev.start.getTime()) / MIN);
  return { required: Math.max(floor, prevSpan) + (touchesCriticalWindow(prev) ? 120 : 0), away };
}

// `role` selects the rule set: 'pilot' for the company agreement, anything else (cabin, or not
// given) for the generic 12h heads-up.
export function restPeriods(duties: ParsedDuty[], role?: CrewRole): RestInfo[] {
  const pilot = role === 'pilot';
  const byDate = new Map<string, ParsedDuty[]>();
  for (const d of duties) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date)!.push(d);
  }

  const periods: Period[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const day = byDate.get(date)!;
    // The window is shared with the duty-time maths so both read a day the same way — in
    // particular a duty that ends after midnight, whose arrival time is a smaller number than
    // its report and would otherwise cut the period short and overstate the rest after it.
    const w = pilot ? workWindow(date, day, PGA_PILOT_RULES) : dutyWindow(date, day);
    if (w) periods.push({ date, start: w.start, end: w.end, duties: day });
  }

  return periods.map((p, i) => {
    const none = { date: p.date, restMinutes: null, requiredMinutes: MIN_REST_MINUTES, away: false, short: false };
    if (i === 0) return none;
    const rest = Math.round((p.start.getTime() - periods[i - 1].end.getTime()) / MIN);
    if (rest < 0) return none;
    if (!pilot) return { ...none, restMinutes: rest, short: rest < MIN_REST_MINUTES };
    const { required, away } = aeRequiredRest(periods[i - 1], p);
    return { date: p.date, restMinutes: rest, requiredMinutes: required, away, short: rest < required };
  });
}

// Rest before a specific day's duty period, or null if not applicable.
export function restBefore(duties: ParsedDuty[], date: string, role?: CrewRole): RestInfo | null {
  return restPeriods(duties, role).find((r) => r.date === date) ?? null;
}
