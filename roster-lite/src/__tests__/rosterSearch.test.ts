import { describe, it, expect } from 'vitest';
import { searchRoster } from '../domain/rosterSearch';
import type { ParsedDuty } from '../domain/types';

const flight = (over: Partial<ParsedDuty>): ParsedDuty => ({
  date: '2026-06-29', dutyCode: 'FLT', dutyType: 'Flight Duty', reportingTime: null,
  departureTime: '08:00', arrivalTime: '09:00', flightNumber: 'TP1134', departureAirport: 'LIS',
  arrivalAirport: 'AGP', aircraftType: 'E90', observations: null, ...over,
});

const duties: ParsedDuty[] = [
  flight({ date: '2026-06-29', flightNumber: 'TP1134', departureAirport: 'LIS', arrivalAirport: 'AGP', crew: [{ login: 'ALPHA', surname: 'ALVES', role: 'CP' }] }),
  flight({ date: '2026-06-30', flightNumber: 'TP400', departureAirport: 'LIS', arrivalAirport: 'RAK' }),
  { date: '2026-07-01', dutyCode: 'DO', dutyType: 'Day Off', reportingTime: null, departureTime: null, arrivalTime: null, flightNumber: null, departureAirport: null, arrivalAirport: null, aircraftType: null, observations: null },
];

describe('searchRoster', () => {
  it('matches by flight number', () => {
    expect(searchRoster(duties, 'tp400').map((h) => h.date)).toEqual(['2026-06-30']);
  });
  it('matches by airport / route', () => {
    expect(searchRoster(duties, 'RAK')).toHaveLength(1);
    expect(searchRoster(duties, 'LIS').length).toBe(2);
  });
  it('matches by crew login/surname', () => {
    expect(searchRoster(duties, 'alves')[0].flightNumber).toBe('TP1134');
  });
  it('matches a duty type and a dd/mm date', () => {
    expect(searchRoster(duties, 'day off')[0].isFlight).toBe(false);
    expect(searchRoster(duties, '30/06')[0].flightNumber).toBe('TP400');
  });
  it('ignores too-short queries', () => {
    expect(searchRoster(duties, 'a')).toEqual([]);
  });
});
