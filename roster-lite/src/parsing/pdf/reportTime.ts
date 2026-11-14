import type { ParsedDuty } from '../../domain/types';

// The roster prints no report time. The app used to take the first departure − 1 h, but the report isn't always an hour
// before (user's audio, Nov 2026: a report at 13:55 for a 15:10 take-off — 1h15 — and the 13:55 is what puts the duty in
// the lunch period, 18 €; a first flight from Porto). The day's printed duty time gives it back: the duty runs from the
// report to the last on-blocks + 30 min, so report = last arrival + 30 min − [DT]. Only on a day of flights / DHCs alone
// (a simulator or office duty in the [DT] would move it), and only when the result is a believable lead (15 min–3 h);
// otherwise the hour before stays.
const POST_FLIGHT = 30;
const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const fmt = (m: number) => {
  const t = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** The report time the day's printed [DT] implies, or null when it can't be told. `day` = that date's duties, in order. */
export function reportFromDt(day: ParsedDuty[], dt: number | undefined): string | null {
  if (!dt || dt <= 0) return null;
  const legs = day.filter((d) => (d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning') && d.departureTime && d.arrivalTime);
  if (!legs.length || day.some((d) => d.dutyType !== 'Flight Duty' && d.dutyType !== 'Positioning' && d.departureTime)) return null;
  // Walk the legs on one clock, past midnight when a time goes backwards.
  let t = hm(legs[0].departureTime!);
  const firstDep = t;
  for (const l of legs) {
    let dep = hm(l.departureTime!);
    while (dep < t) dep += 1440;
    let arr = hm(l.arrivalTime!) + (dep - hm(l.departureTime!));
    while (arr < dep) arr += 1440;
    t = arr;
  }
  const report = t + POST_FLIGHT - dt;
  const lead = firstDep - report;
  return lead >= 15 && lead <= 180 ? fmt(report) : null;
}
