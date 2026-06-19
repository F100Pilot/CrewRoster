import { describe, expect, it } from 'vitest';
import { diffRosters } from '../domain/rosterDiff';
import { nightsAwayFromBase } from '../domain/dutyStats';
import type { ParsedDuty } from '../domain/types';

function duty(partial: Partial<ParsedDuty> & { date: string; dutyCode: string }): ParsedDuty {
  return {
    dutyType: 'Flight Duty',
    reportingTime: null,
    departureTime: null,
    arrivalTime: null,
    flightNumber: null,
    departureAirport: null,
    arrivalAirport: null,
    aircraftType: null,
    observations: null,
    ...partial,
  };
}

describe('diffRosters', () => {
  it('reports no changes for identical rosters', () => {
    const d = [duty({ date: '2026-06-01', dutyCode: 'TP123', flightNumber: 'TP123' })];
    expect(diffRosters(d, d)).toEqual([]);
  });

  it('flags an added day', () => {
    const prev: ParsedDuty[] = [];
    const next = [duty({ date: '2026-06-02', dutyCode: 'OFF' })];
    expect(diffRosters(prev, next)).toEqual([{ date: '2026-06-02', type: 'added' }]);
  });

  it('flags a removed day', () => {
    const prev = [duty({ date: '2026-06-03', dutyCode: 'OFF' })];
    const next: ParsedDuty[] = [];
    expect(diffRosters(prev, next)).toEqual([{ date: '2026-06-03', type: 'removed' }]);
  });

  it('flags a modified day when a flight time changes', () => {
    const prev = [duty({ date: '2026-06-04', dutyCode: 'TP100', flightNumber: 'TP100', departureTime: '08:00' })];
    const next = [duty({ date: '2026-06-04', dutyCode: 'TP100', flightNumber: 'TP100', departureTime: '09:30' })];
    expect(diffRosters(prev, next)).toEqual([{ date: '2026-06-04', type: 'modified' }]);
  });

  it('flags a day off that became a duty', () => {
    const prev = [duty({ date: '2026-06-05', dutyCode: 'OFF', dutyType: 'Day Off' })];
    const next = [duty({ date: '2026-06-05', dutyCode: 'TP200', flightNumber: 'TP200' })];
    expect(diffRosters(prev, next)).toEqual([{ date: '2026-06-05', type: 'modified' }]);
  });

  it('is insensitive to duty ordering within a day', () => {
    const a = duty({ date: '2026-06-06', dutyCode: 'TP1', flightNumber: 'TP1' });
    const b = duty({ date: '2026-06-06', dutyCode: 'TP2', flightNumber: 'TP2' });
    expect(diffRosters([a, b], [b, a])).toEqual([]);
  });
});

describe('nightsAwayFromBase', () => {
  it('counts zero when every day ends back at base', () => {
    const duties = [
      duty({ date: '2026-06-01', dutyCode: 'TP1', flightNumber: 'TP1', departureAirport: 'LIS', arrivalAirport: 'OPO', departureTime: '08:00', arrivalTime: '09:00' }),
      duty({ date: '2026-06-01', dutyCode: 'TP2', flightNumber: 'TP2', departureAirport: 'OPO', arrivalAirport: 'LIS', departureTime: '10:00', arrivalTime: '11:00' }),
    ];
    expect(nightsAwayFromBase(duties)).toBe(0);
  });

  it('counts nights down-route until the return flight', () => {
    const duties = [
      // Out to FNC on the 1st, sit there the 2nd, back to LIS on the 3rd.
      duty({ date: '2026-06-01', dutyCode: 'TP1', flightNumber: 'TP1', departureAirport: 'LIS', arrivalAirport: 'FNC', departureTime: '08:00', arrivalTime: '09:40' }),
      duty({ date: '2026-06-02', dutyCode: 'SBY', dutyType: 'Standby Airport' }),
      duty({ date: '2026-06-03', dutyCode: 'TP2', flightNumber: 'TP2', departureAirport: 'FNC', arrivalAirport: 'LIS', departureTime: '12:00', arrivalTime: '13:40' }),
    ];
    expect(nightsAwayFromBase(duties)).toBe(2); // nights of the 1st and 2nd
  });
});
