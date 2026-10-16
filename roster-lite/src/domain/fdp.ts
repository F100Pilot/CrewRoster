import type { ParsedDuty } from './types';
import { dutyWindow, isStandby } from './dutyTime';
import { HOME_BASE } from './dutyStats';
import { lisbonLocalToUtc } from './standbyWindows';
import { toLocalTime } from '../utils/localTime';
import type { RestInfo } from './restPeriods';

// Maximum flight duty period (FDP / "período de serviço de voo") of a day, under the company
// agreement — RUPT cl. 35, which adopts the legal (EASA ORO.FTL.205) table for acclimatised crew.
// In Entry Narrow-Body operations the reference time is the base's local time (cl. 32.2), i.e.
// Lisbon. The FDP runs from the report to the last on-blocks (cl. 6, def. 31: the flight duty minus
// the debriefing).

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Column "1–2 sectors" of the cl. 35.1 table, by the report time (Lisbon). Each band starts at
// `from` (minutes after midnight) and runs until the next one.
const BASE_BANDS: { from: number; max: number }[] = [
  { from: toMinutes('05:00'), max: toMinutes('12:00') },
  { from: toMinutes('05:15'), max: toMinutes('12:15') },
  { from: toMinutes('05:30'), max: toMinutes('12:30') },
  { from: toMinutes('05:45'), max: toMinutes('12:45') },
  { from: toMinutes('06:00'), max: toMinutes('13:00') },
  { from: toMinutes('13:30'), max: toMinutes('12:45') },
  { from: toMinutes('14:00'), max: toMinutes('12:30') },
  { from: toMinutes('14:30'), max: toMinutes('12:15') },
  { from: toMinutes('15:00'), max: toMinutes('12:00') },
  { from: toMinutes('15:30'), max: toMinutes('11:45') },
  { from: toMinutes('16:00'), max: toMinutes('11:30') },
  { from: toMinutes('16:30'), max: toMinutes('11:15') },
  { from: toMinutes('17:00'), max: toMinutes('11:00') }, // …until 04:59
];

// The table's maximum for a report time (Lisbon, minutes after midnight) and number of sectors.
// The 3- and 4-sector columns are the 1–2 column minus 30 min per extra sector; the agreement's
// table stops at 4 (cl. 15.12 plans at most 4 landings), and beyond it the legal table carries on
// the same way down to a 9h floor.
export function fdpTableMax(reportLocalMin: number, sectors: number): number {
  // Before 05:00 the 17:00–04:59 band applies, which is also the last band — so start from it.
  let base = BASE_BANDS[BASE_BANDS.length - 1].max;
  for (const b of BASE_BANDS) if (reportLocalMin >= b.from) base = b.max;
  return Math.max(9 * 60, base - 30 * Math.max(0, sectors - 2));
}

export interface FdpInfo {
  planned: number; // report → last on-blocks, minutes
  max: number; // the maximum that applies, minutes
  sectors: number; // operated sectors
  reportLocal: string; // report time, Lisbon "HH:mm"
  // Which rule set the maximum: the table, or cl. 35.3 (an early/night start away from base).
  rule: 'table' | 'night-away';
  beyondTable: boolean; // more than 4 sectors — past the agreement's own table
}

const MIN = 60000;

// Whether a rest interval contains a "período noturno de repouso" — 8 consecutive hours between
// 22:00 and 08:00 Lisbon time (RUPT cl. 6, def. 33).
function includesLocalNight(restStart: Date, restEnd: Date): boolean {
  for (let t = restStart.getTime() - 86400000; t <= restEnd.getTime(); t += 86400000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    const nightStart = new Date(`${iso}T${lisbonLocalToUtc(iso, '22:00')}:00Z`).getTime();
    const nightEnd = nightStart + 10 * 60 * MIN; // 08:00 next day
    const overlap = Math.min(nightEnd, restEnd.getTime()) - Math.max(nightStart, restStart.getTime());
    if (overlap >= 8 * 60 * MIN) return true;
  }
  return false;
}

// The FDP of one day's duties, against its maximum. Null when the day has no operated sector.
// `rest` is the rest that preceded the day (restBefore), used by the away-from-base night rule.
export function fdpForDay(dayDuties: ParsedDuty[], rest?: RestInfo | null): FdpInfo | null {
  const work = dayDuties.filter((d) => !isStandby(d));
  const sectors = work.filter((d) => d.dutyType === 'Flight Duty' && d.departureTime && d.arrivalTime);
  if (sectors.length === 0) return null;
  const w = dutyWindow(dayDuties[0].date, work);
  if (!w) return null;

  const at = (t: string) => (toMinutes(t) - w.open + 1440) % 1440;
  const planned = Math.max(...sectors.map((s) => at(s.arrivalTime!)));
  const date = dayDuties[0].date;
  const startUtc = `${String(Math.floor(w.open / 60)).padStart(2, '0')}:${String(w.open % 60).padStart(2, '0')}`;
  const reportLocal = toLocalTime(date, startUtc, 'LIS') ?? startUtc;
  const reportMin = toMinutes(reportLocal);

  let max = fdpTableMax(reportMin, sectors.length);
  let rule: FdpInfo['rule'] = 'table';

  // cl. 35.3 — away from base, a report between 22:00 and 06:00 caps the FDP at 6h, or 9h when
  // the preceding rest was at least 16h and included a local night.
  const firstLeg = work
    .filter((d) => d.departureAirport && d.departureTime)
    .reduce<ParsedDuty | null>((a, b) => (!a || at(b.departureTime!) < at(a.departureTime!) ? b : a), null);
  const away = !!firstLeg && firstLeg.departureAirport!.toUpperCase() !== HOME_BASE;
  if (away && (reportMin >= 22 * 60 || reportMin < 6 * 60)) {
    let cap = 6 * 60;
    if (rest?.restMinutes != null && rest.restMinutes >= 16 * 60) {
      const restEnd = w.start;
      const restStart = new Date(restEnd.getTime() - rest.restMinutes * MIN);
      if (includesLocalNight(restStart, restEnd)) cap = 9 * 60;
    }
    if (cap < max) { max = cap; rule = 'night-away'; }
  }

  return { planned, max, sectors: sectors.length, reportLocal, rule, beyondTable: sectors.length > 4 };
}
