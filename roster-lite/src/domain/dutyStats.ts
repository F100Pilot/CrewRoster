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
