import type { ParsedDuty } from './types';
import { dutyWindow } from './dutyTime';

// Rest between consecutive duty periods. A "duty period" is one calendar day that
// has at least one timed duty: it starts at the earliest reporting/departure time
// and ends at the latest arrival/departure time. Rest before a period is the gap
// from the previous period's end to this period's start.
//
// Indicative only: EASA minimum rest depends on home-base vs down-route and the
// preceding duty length. We flag anything under 12h as a heads-up, clearly labelled.
export const MIN_REST_MINUTES = 12 * 60;

export interface RestInfo {
  date: string;
  restMinutes: number | null; // null for the first period or when it can't be computed
  short: boolean; // below the indicative minimum
}

interface Period {
  date: string;
  start: Date;
  end: Date;
}

// The day's duty window. Shared with the cumulative duty-time maths so both read a day
// the same way — in particular a duty that ends after midnight, whose arrival time is a
// smaller number than its report and would otherwise cut the period short and overstate
// the rest that follows it.
function buildPeriod(date: string, duties: ParsedDuty[]): Period | null {
  const w = dutyWindow(date, duties);
  return w ? { date, start: w.start, end: w.end } : null;
}

export function restPeriods(duties: ParsedDuty[]): RestInfo[] {
  const byDate = new Map<string, ParsedDuty[]>();
  for (const d of duties) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date)!.push(d);
  }

  const periods: Period[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const p = buildPeriod(date, byDate.get(date)!);
    if (p) periods.push(p);
  }

  return periods.map((p, i) => {
    if (i === 0) return { date: p.date, restMinutes: null, short: false };
    const rest = Math.round((p.start.getTime() - periods[i - 1].end.getTime()) / 60000);
    if (rest < 0) return { date: p.date, restMinutes: null, short: false };
    return { date: p.date, restMinutes: rest, short: rest < MIN_REST_MINUTES };
  });
}

// Rest before a specific day's duty period, or null if not applicable.
export function restBefore(duties: ParsedDuty[], date: string): RestInfo | null {
  return restPeriods(duties).find((r) => r.date === date) ?? null;
}
