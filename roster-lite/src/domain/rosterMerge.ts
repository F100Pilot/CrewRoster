import type { ParsedDuty, PlannedTimes } from './types';

// Merge a freshly downloaded roster into the one already stored, so separate downloads
// (e.g. one month, then another) accumulate into a single list/calendar.
//
// Strategy: PER-DAY override. For every date the incoming download contains, its duties
// replace whatever was stored for that date (so changes and cancellations are picked
// up). Dates the incoming download does NOT contain are kept verbatim — even if they
// fall "inside" the new download's date span.
//
// Why not wipe the whole [min..max] window: a real roster day always has at least one
// entry (a flight, a day off, standby…), so a date absent from the incoming set means
// the parse simply didn't produce it, NOT that the day became empty. Wiping the window
// would then delete previously-good days whenever a download/parse is partial — the
// "old data got mixed up / I had to clear everything" symptom. Keeping silent days is
// strictly safer and identical for a complete download (which covers every date in its
// range).
//
// `asOfISO` is the day the incoming roster was downloaded. CrewLink reports days already past
// with the times actually flown, so before a past day is overwritten the plan it replaces is
// kept on each sector (`planned`) — the last version seen while the day was still ahead. The
// incoming duty is marked `settled` so a later sync never mistakes flown times for a plan.
//
// `blankDates` are the exception to "silent days are kept": days the download SHOWS with nothing
// printed under them (pgaBlankDates). There the day really is empty now, so what was stored goes —
// a flight removed from the 29th must not keep paying a per diem.
export function mergeDuties(previous: ParsedDuty[], incoming: ParsedDuty[], asOfISO?: string, blankDates: string[] = []): ParsedDuty[] {
  if (incoming.length === 0) return [...previous];

  const incomingDates = new Set([...incoming.map((d) => d.date), ...blankDates]);
  const kept = previous.filter((d) => !incomingDates.has(d.date));
  const next = carryIoPlans(previous, asOfISO ? carryPlans(previous, incoming, asOfISO) : incoming);

  return [...kept, ...next].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

const sectorKey = (d: ParsedDuty) => `${d.date}|${d.flightNumber}|${d.departureAirport}|${d.arrivalAirport}`;
const timesOf = (d: ParsedDuty): PlannedTimes =>
  ({ reportingTime: d.reportingTime, departureTime: d.departureTime, arrivalTime: d.arrivalTime });
const sameTimes = (a: PlannedTimes, b: PlannedTimes) =>
  a.reportingTime === b.reportingTime && a.departureTime === b.departureTime && a.arrivalTime === b.arrivalTime;

function carryPlans(previous: ParsedDuty[], incoming: ParsedDuty[], asOfISO: string): ParsedDuty[] {
  const prevByKey = new Map<string, ParsedDuty>();
  for (const d of previous) if (d.flightNumber) prevByKey.set(sectorKey(d), d);
  return incoming.map((d) => {
    // Still ahead: the incoming times are the plan itself.
    if (d.date > asOfISO || !d.flightNumber) return d;
    const prev = prevByKey.get(sectorKey(d));
    // A plan already kept wins; otherwise the previous version is the plan — unless it was
    // itself imported after the day, when its times were flown ones too. On the day itself a
    // sync can show legs already flown, so the plan comes from the version before it.
    const plan = prev?.planned ?? (prev && !prev.settled && !sameTimes(timesOf(prev), timesOf(d)) ? timesOf(prev) : undefined);
    const out: ParsedDuty = { ...d };
    if (plan && !sameTimes(plan, timesOf(d))) {
      out.planned = plan;
      // The report is not a flown time: the PDF has none, the parser derives it as the first
      // departure − 1 h, so after the day it would follow the actual departure and a delay would
      // move the report too. The crew reported at the planned time — keep it (user rule: the report
      // is always the one before the post-flight update). FDP, rest and the meal allowances then
      // run from the real report.
      if (plan.reportingTime) out.reportingTime = plan.reportingTime;
    }
    if (d.date < asOfISO) out.settled = true;
    return out;
  });
}

// An IO (irregularidade operacional) replaces the day's planned duty. What it replaced is the
// evidence of the "prevenir" (domain/irregularity.ts): an IO starting at the planned report. So the
// stored day's report and printed duty time are kept on the IO, as `planned` — the earliest report and
// last arrival of the duties it replaces, their [DT] — or the plan an IO already carried (a later
// download shows the same IO again).
function carryIoPlans(previous: ParsedDuty[], incoming: ParsedDuty[]): ParsedDuty[] {
  if (!incoming.some((d) => d.dutyCode === 'IO')) return incoming;
  return incoming.map((d) => {
    if (d.dutyCode !== 'IO') return d;
    const before = previous.filter((p) => p.date === d.date);
    const kept = before.find((p) => p.dutyCode === 'IO' && p.planned)?.planned;
    if (kept) return { ...d, planned: kept };
    const busy = before.filter((p) => p.dutyCode !== 'IO' && p.dutyType !== 'Day Off' && p.dutyType !== 'Vacation');
    // The report is on the first duty only (the parser derives it); the end is the last arrival.
    const work = busy.filter((p) => p.reportingTime).sort((a, b) => (a.reportingTime! < b.reportingTime! ? -1 : 1));
    if (!work.length) return d;
    const last = [...busy].filter((p) => p.arrivalTime)
      .sort((a, b) => ((a.departureTime ?? '') < (b.departureTime ?? '') ? -1 : 1)).pop() ?? work[0];
    const dutyMinutes = before.find((p) => p.rosterDt !== undefined)?.rosterDt ?? null;
    return { ...d, planned: { reportingTime: work[0].reportingTime, departureTime: work[0].departureTime, arrivalTime: last.arrivalTime, dutyMinutes } };
  });
}
