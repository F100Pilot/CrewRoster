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
export function mergeDuties(previous: ParsedDuty[], incoming: ParsedDuty[], asOfISO?: string): ParsedDuty[] {
  if (incoming.length === 0) return [...previous];

  const incomingDates = new Set(incoming.map((d) => d.date));
  const kept = previous.filter((d) => !incomingDates.has(d.date));
  const next = asOfISO ? carryPlans(previous, incoming, asOfISO) : incoming;

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
    if (plan && !sameTimes(plan, timesOf(d))) out.planned = plan;
    if (d.date < asOfISO) out.settled = true;
    return out;
  });
}
