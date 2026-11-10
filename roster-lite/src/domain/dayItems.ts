import type { ParsedDuty } from './types';
import { legsOf, type Leg } from './dayPhase';
import { utcDateTime } from '../utils/duration';

const DAY = 86_400_000;

// One item of the day on the timeline: a leg, or any other duty with its own times.
export interface Item { duty: ParsedDuty; start: Date | null; end: Date | null; place: string | null; leg: Leg | null }
export function dayItems(date: string, duties: ParsedDuty[], base: string): Item[] {
  const legs = legsOf(date, duties);
  const items: Item[] = duties.map((d) => {
    const leg = legs.find((l) => l.duty === d) ?? null;
    if (leg) return { duty: d, start: leg.off, end: leg.on, place: d.departureAirport, leg };
    const s = d.reportingTime ?? d.departureTime;
    const start = s ? utcDateTime(date, s) : null;
    let end = d.arrivalTime ? utcDateTime(date, d.arrivalTime) : null;
    if (start && end && end < start) end = new Date(end.getTime() + DAY);
    return { duty: d, start, end, place: d.departureAirport ?? base, leg: null };
  });
  return items.sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));
}
