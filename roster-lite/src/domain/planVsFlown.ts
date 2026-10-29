import { fdpForDay } from './fdp';
import { restPeriods } from './restPeriods';
import { HOME_BASE } from './dutyStats';
import type { ParsedDuty } from './types';

// What was flown against what was planned, for the pilot's pay check. The plan of each sector
// is kept by `mergeDuties` when a sync after the day brings the flown times; from the pair this
// derives the delays, the extra duty, and the two events the RRRGS pays outside the plafonds:
//   • an FDP extended past its maximum by the commander (RUPT cl. 27; RRRGS cl. 2.6 — 2h of
//     duty-pay each);
//   • a rest cut below its minimum by an operational irregularity (RUPT cl. 34.3 at base,
//     cl. 36 away; RRRGS cl. 2.8 — the time cut, in duty-pay).
// Only days whose plan is on record count: a day first imported after it was flown has nothing
// to compare with.

// A sector counts as late from 15 minutes, the usual punctuality line.
export const LATE_MINUTES = 15;

export interface SectorDelay {
  date: string;
  flightNumber: string;
  from: string;
  to: string;
  plannedOff: string;
  plannedOn: string;
  off: string;
  on: string;
  depDelay: number; // minutes, negative = early
  arrDelay: number;
}

export interface FdpExtension {
  date: string;
  fdp: number; // flown FDP, minutes
  max: number;
  over: number; // minutes beyond the maximum
}

export interface RestReduction {
  date: string; // the duty the rest led into
  rest: number;
  required: number;
  cut: number; // minutes below the minimum
  away: boolean;
}

export interface PlanVsFlown {
  month: string; // "YYYY-MM"
  hasPlan: boolean; // any sector in the month with its plan on record
  sectors: SectorDelay[];
  late: number; // sectors arriving ≥ LATE_MINUTES late
  extraDuty: number; // FDP minutes flown beyond the planned ones (net, over the month)
  extensions: FdpExtension[];
  reductions: RestReduction[];
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
// Signed difference between two clock times, folded into ±12h so a delay across midnight reads
// as a delay and not as 23 hours early.
const signedDiff = (from: string, to: string) => ((toMin(to) - toMin(from) + 720 + 1440) % 1440) - 720;

// The roster as it was planned: each sector with its kept plan in place of the flown times.
export function asPlanned(duties: ParsedDuty[]): ParsedDuty[] {
  return duties.map((d) => (d.planned ? { ...d, ...d.planned } : d));
}

function byDate(duties: ParsedDuty[]): Map<string, ParsedDuty[]> {
  const m = new Map<string, ParsedDuty[]>();
  for (const d of duties) {
    if (!m.has(d.date)) m.set(d.date, []);
    m.get(d.date)!.push(d);
  }
  return m;
}

// `todayISO` bounds the analysis to days already flown (today included: a sync on the day can
// carry the legs flown so far).
export function planVsFlown(duties: ParsedDuty[], month: string, todayISO: string, base: string = HOME_BASE): PlanVsFlown {
  const flownDays = (d: { date: string }) => d.date.startsWith(month) && d.date <= todayISO;
  const plan = asPlanned(duties);
  const flownByDate = byDate(duties);
  const planByDate = byDate(plan);
  const restFlown = new Map(restPeriods(duties, 'pilot', base).map((r) => [r.date, r]));
  const restPlan = new Map(restPeriods(plan, 'pilot', base).map((r) => [r.date, r]));
  const withPlan = new Set(duties.filter((d) => d.planned).map((d) => d.date));

  const sectors: SectorDelay[] = duties
    .filter((d) => d.planned && flownDays(d) && d.flightNumber && d.departureTime && d.arrivalTime
      && d.planned.departureTime && d.planned.arrivalTime)
    .map((d) => ({
      date: d.date,
      flightNumber: d.flightNumber!,
      from: d.departureAirport ?? '',
      to: d.arrivalAirport ?? '',
      plannedOff: d.planned!.departureTime!,
      plannedOn: d.planned!.arrivalTime!,
      off: d.departureTime!,
      on: d.arrivalTime!,
      depDelay: signedDiff(d.planned!.departureTime!, d.departureTime!),
      arrDelay: signedDiff(d.planned!.arrivalTime!, d.arrivalTime!),
    }));

  // FDP per day with a plan on record: flown vs planned, and the commander's extensions — an
  // FDP over its maximum that the plan kept within it.
  const extensions: FdpExtension[] = [];
  const overByDate = new Map<string, number>();
  let extraDuty = 0;
  for (const date of [...withPlan].filter((d) => flownDays({ date: d })).sort()) {
    const flown = fdpForDay(flownByDate.get(date)!, restFlown.get(date), base);
    const planned = fdpForDay(planByDate.get(date)!, restPlan.get(date), base);
    if (!flown || !planned) continue;
    extraDuty += flown.planned - planned.planned;
    if (flown.planned > flown.max && planned.planned <= planned.max) {
      const over = flown.planned - flown.max;
      extensions.push({ date, fdp: flown.planned, max: flown.max, over });
      overByDate.set(date, over);
    }
  }

  // Rests cut below the minimum. The minimum is read off the plan — cl. 34.1 sizes the rest on
  // the planned work period, not on a day that ran long — plus, after a commander's extension,
  // twice the time exceeded (cl. 27.2). A rest the plan itself left short is a planning matter,
  // not a reduction, and isn't counted.
  const reductions: RestReduction[] = [];
  const periods = restPeriods(duties, 'pilot', base);
  for (const [i, flown] of periods.entries()) {
    const prevDate = periods[i - 1]?.date;
    if (!prevDate || !flownDays(flown) || !(withPlan.has(flown.date) || withPlan.has(prevDate))) continue;
    const planned = restPlan.get(flown.date);
    if (flown.restMinutes == null || planned?.restMinutes == null) continue;
    const required = planned.requiredMinutes + 2 * (overByDate.get(prevDate) ?? 0);
    if (planned.restMinutes < planned.requiredMinutes || flown.restMinutes >= required) continue;
    reductions.push({ date: flown.date, rest: flown.restMinutes, required, cut: required - flown.restMinutes, away: planned.away });
  }

  const inMonth = duties.some((d) => d.planned && flownDays(d));
  return {
    month,
    hasPlan: inMonth,
    sectors,
    late: sectors.filter((s) => s.arrDelay >= LATE_MINUTES).length,
    extraDuty,
    extensions,
    reductions,
  };
}
