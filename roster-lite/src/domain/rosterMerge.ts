import type { ParsedDuty } from './types';

// Merge a freshly downloaded roster into the one already stored, so separate
// downloads (e.g. one month, then another) accumulate into a single list/calendar.
//
// The incoming download is authoritative for the contiguous date range it covers
// [min..max]: within that window its duties win (handling additions, changes AND
// removals — a day cleared in the new download is cleared here too). Dates outside
// the incoming window keep whatever was stored before. This lets you build up the
// year from partial downloads while still picking up roster changes on re-download.
export function mergeDuties(previous: ParsedDuty[], incoming: ParsedDuty[]): ParsedDuty[] {
  if (incoming.length === 0) return [...previous];

  let min = incoming[0].date;
  let max = incoming[0].date;
  for (const d of incoming) {
    if (d.date < min) min = d.date;
    if (d.date > max) max = d.date;
  }

  // Keep previous duties strictly outside the incoming window; drop the rest (the
  // incoming download replaces everything within [min..max]).
  const kept = previous.filter((d) => d.date < min || d.date > max);

  return [...kept, ...incoming].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}
