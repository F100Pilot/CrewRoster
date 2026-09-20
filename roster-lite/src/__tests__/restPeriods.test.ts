import { describe, expect, it } from 'vitest';
import { restPeriods, MIN_REST_MINUTES } from '../domain/restPeriods';
import type { ParsedDuty } from '../domain/types';

function duty(p: Partial<ParsedDuty> & { date: string; dutyType: string }): ParsedDuty {
  return {
    dutyCode: 'FLT', flightNumber: null, departureAirport: null, arrivalAirport: null,
    departureTime: null, arrivalTime: null, reportingTime: null, aircraftType: null,
    observations: null, ...p,
  } as ParsedDuty;
}

describe('restPeriods', () => {
  it('measures the gap between the end of one duty period and the start of the next', () => {
    const r = restPeriods([
      duty({ date: '2026-06-01', dutyType: 'Flight Duty', reportingTime: '05:30', departureTime: '06:00', arrivalTime: '14:00' }),
      duty({ date: '2026-06-02', dutyType: 'Flight Duty', reportingTime: '08:00', departureTime: '08:30', arrivalTime: '12:00' }),
    ]);
    expect(r[0].restMinutes).toBeNull(); // nothing before the first period
    expect(r[1].restMinutes).toBe(18 * 60); // 14:00 → 08:00 next day
    expect(r[1].short).toBe(false);
  });

  // Regression: the arrival (01:30) is a smaller clock value than the report (21:00), so
  // taking the day's latest time as text ended the period at 22:00 and credited 3h30 of
  // rest that was never there — a short rest could read as adequate.
  it('does not overstate the rest after a duty that ends past midnight', () => {
    const r = restPeriods([
      duty({ date: '2026-06-01', dutyType: 'Flight Duty', reportingTime: '21:00', departureTime: '22:00', arrivalTime: '01:30' }),
      duty({ date: '2026-06-02', dutyType: 'Flight Duty', reportingTime: '12:00', departureTime: '13:00', arrivalTime: '17:00' }),
    ]);
    expect(r[1].restMinutes).toBe(10 * 60 + 30); // 01:30 → 12:00, not 22:00 → 12:00
  });

  it('flags a rest below the indicative minimum', () => {
    const r = restPeriods([
      duty({ date: '2026-06-01', dutyType: 'Flight Duty', reportingTime: '06:00', departureTime: '06:30', arrivalTime: '20:00' }),
      duty({ date: '2026-06-02', dutyType: 'Flight Duty', reportingTime: '07:00', departureTime: '07:30', arrivalTime: '12:00' }),
    ]);
    expect(r[1].restMinutes).toBe(11 * 60);
    expect(r[1].short).toBe(true);
    expect(MIN_REST_MINUTES).toBe(12 * 60);
  });

  it('skips days with no timed duty', () => {
    const r = restPeriods([
      duty({ date: '2026-06-01', dutyType: 'Flight Duty', reportingTime: '06:00', departureTime: '06:30', arrivalTime: '12:00' }),
      duty({ date: '2026-06-02', dutyType: 'Day Off' }),
      duty({ date: '2026-06-03', dutyType: 'Flight Duty', reportingTime: '06:00', departureTime: '06:30', arrivalTime: '12:00' }),
    ]);
    expect(r.map((x) => x.date)).toEqual(['2026-06-01', '2026-06-03']);
    expect(r[1].restMinutes).toBe(42 * 60); // 12:00 day 1 → 06:00 day 3
  });
});
