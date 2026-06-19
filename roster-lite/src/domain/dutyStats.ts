import type { ParsedDuty } from './types';
import { diffMinutes } from '../utils/duration';

// Flights (and positioning legs) that have both endpoints timed, in departure order.
export function timedFlights(duties: ParsedDuty[]): ParsedDuty[] {
  return duties
    .filter(
      (d) =>
        (d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning') &&
        d.departureTime &&
        d.arrivalTime
    )
    .sort((a, b) => (a.departureTime! < b.departureTime! ? -1 : 1));
}

// Portugália's home base. Used to count nights spent down-route.
export const HOME_BASE = 'LIS';

// How many nights in this set of duties were spent away from base. We walk the days
// in order, tracking where the crew member ends up: a day's last flight sets the new
// location; a day with no flights keeps the previous one (still down-route on a
// layover). Each day that ends somewhere other than base is one night away.
export function nightsAwayFromBase(duties: ParsedDuty[], base: string = HOME_BASE): number {
  const home = base.toUpperCase();
  const byDate = new Map<string, ParsedDuty[]>();
  for (const d of duties) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date)!.push(d);
  }
  let location = home;
  let nights = 0;
  for (const date of [...byDate.keys()].sort()) {
    const flights = timedFlights(byDate.get(date)!);
    const lastArr = flights[flights.length - 1]?.arrivalAirport;
    if (lastArr) location = lastArr.toUpperCase();
    if (location !== home) nights++;
  }
  return nights;
}

export interface DayStats {
  blockMinutes: number; // sum of all flight block times
  dutyMinutes: number; // check-in → last arrival
  checkIn: string; // "HH:mm" UTC
}

// Block + duty totals for a single day's duties, or null if it has no timed flights.
export function dayStats(duties: ParsedDuty[]): DayStats | null {
  const flights = timedFlights(duties);
  if (flights.length === 0) return null;
  const blockMinutes = flights.reduce(
    (sum, f) => sum + diffMinutes(f.departureTime!, f.arrivalTime!),
    0
  );
  const checkIn =
    duties.map((d) => d.reportingTime).find((t): t is string => !!t) ?? flights[0].departureTime!;
  const lastArrival = flights[flights.length - 1].arrivalTime!;
  return { blockMinutes, dutyMinutes: diffMinutes(checkIn, lastArrival), checkIn };
}
