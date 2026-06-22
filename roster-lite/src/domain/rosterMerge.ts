import type { ParsedDuty } from './types';

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
export function mergeDuties(previous: ParsedDuty[], incoming: ParsedDuty[]): ParsedDuty[] {
  if (incoming.length === 0) return [...previous];

  const incomingDates = new Set(incoming.map((d) => d.date));
  const kept = previous.filter((d) => !incomingDates.has(d.date));

  return [...kept, ...incoming].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}
