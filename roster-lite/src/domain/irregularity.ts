import type { ParsedDuty } from './types';

// IO — "irregularidade operacional": the roster puts it in place of the duty that was planned, with
// the time the crew member was actually held (e.g. LIS 10:15–16:40).
//
// The "prevenir" case (a colleague's report, confirmed by the user): called at the report for the
// alcohol test, the crew member can't fly the planned duty. It isn't their absence, so the day
// counts in full — duty, per diem A (national, at base: no tax exemption) and the RAACO meal
// allowances of the IO's period (Tabela 33). It shows on the roster as an IO with exactly the duty
// that was planned (`planned`, kept by mergeDuties from the earlier download — see autoPrevenir).
// Only without an earlier download to compare with does the crew member say it (`prevenir`) — when the
// roster can tell, it decides (user: the button only when there's no way to compare).
// Any other IO: shown and counted as duty time; per diem and allowances pending the user's check.

export const isIO = (d: ParsedDuty): boolean => d.dutyCode === 'IO';

const ioStart = (d: ParsedDuty) => d.reportingTime ?? d.departureTime;

// The prevenir is the SAME duty before and after the IO (user rule): the roster's printed duty time
// ([DT]) of the day as planned equals the IO day's. That's the comparison when both PDFs had it; an
// IO normal (Manchester: flights, then the IO) has a different duty. Older stored days without a
// [DT] fall back to the IO covering the planned duty — report to last arrival + the 30-min
// post-flight — within PREVENIR_TOLERANCE_MIN, since the app's report is the departure − 1 h and the
// real one is a few minutes off.
export const PREVENIR_TOLERANCE_MIN = 15;
const POST_FLIGHT_MIN = 30;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const near = (a: number, b: number) => {
  const diff = Math.abs(a - b) % 1440;
  return Math.min(diff, 1440 - diff) <= PREVENIR_TOLERANCE_MIN;
};

export function autoPrevenir(d: ParsedDuty): boolean {
  const plan = d.planned;
  if (!isIO(d) || !plan) return false;
  if (plan.dutyMinutes != null && d.rosterDt !== undefined) return plan.dutyMinutes === d.rosterDt;
  const start = ioStart(d);
  if (!start || !d.arrivalTime || !plan.reportingTime || !plan.arrivalTime) return false;
  return near(minutesOf(start), minutesOf(plan.reportingTime))
    && near(minutesOf(d.arrivalTime), minutesOf(plan.arrivalTime) + POST_FLIGHT_MIN);
}

// The roster can tell: there is a planned version of the day to compare the IO with.
export const canCompareIO = (d: ParsedDuty): boolean => isIO(d) && !!d.planned?.reportingTime;

export function isPrevenirIO(d: ParsedDuty): boolean {
  if (!isIO(d)) return false;
  return canCompareIO(d) ? autoPrevenir(d) : d.prevenir === true;
}

// The IO's period as real instants (UTC times on the roster; an end before the start = next day).
export function ioInterval(d: ParsedDuty): { start: Date; end: Date } | null {
  const s = ioStart(d);
  if (!s || !d.arrivalTime) return null;
  const start = new Date(`${d.date}T${s}:00Z`);
  let end = new Date(`${d.date}T${d.arrivalTime}:00Z`);
  if (end <= start) end = new Date(end.getTime() + 86_400_000);
  return { start, end };
}
