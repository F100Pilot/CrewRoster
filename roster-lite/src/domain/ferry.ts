import type { ParsedDuty } from './types';

// RRRGS cl. 12.2 b ii: a ferry counts 100% of its flight and duty time on top of alínea a — summed (cl. 12.2: "somatório
// das percentagens"), so it counts double (a tester, Nov 2026: "voo em ferry conta a dobrar"; his roster: TP 9750 AVR→LIS
// after a taxi to Alverca). The roster doesn't say "ferry": the 9xxx flight numbers are the candidates — but not every
// one is a ferry (user), so the pilot has a switch on the day page; on by default for a 9xxx flight.
export const FERRY_NUMBER = /^[A-Z0-9]{2}9\d{3}$/;
export const isFerryCandidate = (d: ParsedDuty): boolean =>
  d.dutyType === 'Flight Duty' && FERRY_NUMBER.test(d.flightNumber ?? '');

// The pilot's word on the day (true / false), or null when he hasn't said.
export const ferryChoice = (day: ParsedDuty[]): boolean | null => day.find((d) => d.ferry != null)?.ferry ?? null;

// The day's sectors flown as a ferry.
export function ferrySectors(day: ParsedDuty[]): ParsedDuty[] {
  return ferryChoice(day) === false ? [] : day.filter(isFerryCandidate);
}
