import type { ParsedDuty } from './types';

// IO — "irregularidade operacional": the roster puts it in place of the duty that was planned, with
// the time the crew member was actually held (e.g. LIS 10:15–16:40).
//
// The "prevenir" case (a colleague's report, confirmed by the user): called at the report for the
// alcohol test, the crew member can't fly the planned duty. It isn't their absence, so the day
// counts in full — duty, per diem A (national, at base: no tax exemption) and the RAACO meal
// allowances of the IO's period (Tabela 33). It shows on the roster as an IO that starts exactly at
// the planned PSV's report (`planned.reportingTime`, kept by mergeDuties from the earlier download).
// Only without an earlier download to compare with does the crew member say it (`prevenir`) — when the
// roster can tell, it decides (user: the button only when there's no way to compare).
// Any other IO: shown and counted as duty time; per diem and allowances pending the user's check.

export const isIO = (d: ParsedDuty): boolean => d.dutyCode === 'IO';

const ioStart = (d: ParsedDuty) => d.reportingTime ?? d.departureTime;

// How far the IO's start may be from the planned report and still be "at the report". The PDF has
// no report time: the app takes the first departure − 1 h, while the real one is a few minutes off
// (MAN case: departure 06:12, the roster's FDP puts the report at 05:15). A colleague's prevenir
// wasn't recognised for that; an IO normal starts after about an hour of duty, well beyond this.
export const PREVENIR_TOLERANCE_MIN = 15;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Read from the roster alone: the IO opens at the planned report (give or take the tolerance).
export function autoPrevenir(d: ParsedDuty): boolean {
  const start = ioStart(d);
  const plan = d.planned?.reportingTime;
  if (!isIO(d) || !start || !plan) return false;
  const diff = Math.abs(minutesOf(start) - minutesOf(plan));
  return Math.min(diff, 1440 - diff) <= PREVENIR_TOLERANCE_MIN;
}

// The roster can tell: there is a planned report to compare the IO's start with.
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
