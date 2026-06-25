import { describe, it, expect } from 'vitest';
import { flightsWithColleague, allColleagues } from '../domain/crewSearch';
import type { ParsedDuty } from '../domain/types';

const flight = (over: Partial<ParsedDuty>): ParsedDuty => ({
  date: '2026-01-01', dutyCode: 'FLT', dutyType: 'Flight Duty', reportingTime: null,
  departureTime: '08:00', arrivalTime: '09:00', flightNumber: 'TP1', departureAirport: 'LIS',
  arrivalAirport: 'OPO', aircraftType: 'E90', observations: null, ...over,
});

const A = { login: 'ALPHA', surname: 'ALVES', role: 'CP' };
const B = { login: 'BRAVO', surname: 'BRAGA', role: 'FO', firstName: 'BRUNO' };

describe('flightsWithColleague', () => {
  it('lists the flights flown with a colleague, chronologically, with their role', () => {
    const duties = [
      flight({ date: '2026-01-05', flightNumber: 'TP100', crew: [A, B] }),
      flight({ date: '2026-01-03', flightNumber: 'TP90', crew: [A] }),
      flight({ date: '2026-01-04', flightNumber: 'TP95', crew: [B] }), // no A
      flight({ date: '2026-01-02', dutyType: 'Day Off', crew: undefined }),
    ];
    const res = flightsWithColleague(duties, 'alpha');
    expect(res.map((f) => f.flightNumber)).toEqual(['TP90', 'TP100']);
    expect(res[0].role).toBe('CP');
  });

  it('returns nothing for an unknown colleague or empty login', () => {
    expect(flightsWithColleague([flight({ crew: [A] })], 'ZZZ')).toEqual([]);
    expect(flightsWithColleague([flight({ crew: [A] })], '')).toEqual([]);
  });
});

describe('allColleagues', () => {
  it('counts shared flights, excludes the user, and orders by most-flown-with', () => {
    const duties = [
      flight({ crew: [A, B] }),
      flight({ crew: [A, B] }),
      flight({ crew: [B] }),
    ];
    const cols = allColleagues(duties, 'ALPHA'); // exclude self (ALPHA)
    expect(cols.map((c) => c.login)).toEqual(['BRAVO']);
    expect(cols[0].count).toBe(3);
    expect(cols[0].firstName).toBe('BRUNO');
  });
});
