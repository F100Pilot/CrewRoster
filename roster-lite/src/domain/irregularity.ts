import type { ParsedDuty } from './types';

// IO — "irregularidade operacional": the roster puts it in place of the duty that was planned, with
// the time the crew member was actually held (e.g. LIS 10:15–16:40).
//
// The "prevenir" case (a colleague's report, confirmed by the user): called at the report for the
// alcohol test, the crew member can't fly the planned duty. It isn't their absence, so the day
// counts in full — duty, per diem A (national, at base: no tax exemption) and the RAACO meal
// allowances of the IO's period (Tabela 33). It shows on the roster as an IO that starts exactly at
// the planned PSV's report (`planned.reportingTime`, kept by mergeDuties from the earlier download).
// Without an earlier download to compare with, the crew member marks it (`prevenir`).
// Any other IO: shown and counted as duty time; per diem and allowances pending the user's check.

export const isIO = (d: ParsedDuty): boolean => d.dutyCode === 'IO';

const ioStart = (d: ParsedDuty) => d.reportingTime ?? d.departureTime;

// Read from the roster alone: the IO opens at the planned report.
export function autoPrevenir(d: ParsedDuty): boolean {
  const start = ioStart(d);
  return isIO(d) && !!start && !!d.planned?.reportingTime && d.planned.reportingTime === start;
}

export function isPrevenirIO(d: ParsedDuty): boolean {
  return isIO(d) && (d.prevenir ?? autoPrevenir(d));
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
