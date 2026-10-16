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

// Company agreement (pilots): RUPT cl. 25 and 34.
describe('restPeriods — company agreement (pilots)', () => {
  const leg = (date: string, from: string, to: string, report: string | null, off: string, on: string) =>
    duty({ date, dutyType: 'Flight Duty', departureAirport: from, arrivalAirport: to, reportingTime: report, departureTime: off, arrivalTime: on });

  it('measures rest from 30 min after on-blocks and asks 12h at base', () => {
    const r = restPeriods([
      leg('2026-06-01', 'OPO', 'LIS', '05:30', '06:30', '07:30'),
      leg('2026-06-02', 'LIS', 'OPO', '08:00', '09:00', '10:00'),
    ], 'pilot');
    expect(r[1]).toMatchObject({ restMinutes: 24 * 60, requiredMinutes: 12 * 60, away: false, short: false });
  });

  it('asks 10h away from base — or the length of the previous duty when longer', () => {
    // Day 1: report 08:00, ends at FNC 18:00 + 30 → a 10h30 duty, so 10h30 of rest are owed.
    const r = restPeriods([
      leg('2026-06-01', 'LIS', 'FNC', '08:00', '16:00', '18:00'),
      leg('2026-06-02', 'FNC', 'LIS', '04:30', '05:30', '07:10'),
    ], 'pilot');
    expect(r[1]).toMatchObject({ restMinutes: 10 * 60, requiredMinutes: 10 * 60 + 30, away: true, short: true });
  });

  it('adds 2h after a duty that touched 02:00–05:59 Lisbon time', () => {
    // 01:00Z–03:00Z in June is 02:00–04:00 Lisbon, ending at base: 12h + 2h.
    const r = restPeriods([
      leg('2026-06-01', 'OPO', 'LIS', '00:00', '01:00', '03:00'),
      leg('2026-06-02', 'LIS', 'OPO', '15:00', '16:00', '17:00'),
    ], 'pilot');
    expect(r[1].requiredMinutes).toBe(14 * 60);
  });

  it('asks only 9h at base before ground work that follows flying', () => {
    const r = restPeriods([
      leg('2026-06-01', 'OPO', 'LIS', '13:00', '14:00', '16:00'),
      duty({ date: '2026-06-02', dutyType: 'Training', dutyCode: 'RGTC1', departureTime: '01:30', arrivalTime: '05:00' }),
    ], 'pilot');
    expect(r[1]).toMatchObject({ restMinutes: 9 * 60, requiredMinutes: 9 * 60, short: false });
  });

  it('leaves a standby out of the duty period', () => {
    const r = restPeriods([
      leg('2026-06-01', 'OPO', 'LIS', '05:30', '06:30', '07:30'),
      duty({ date: '2026-06-02', dutyType: 'Standby Home', dutyCode: 'H7+', reportingTime: '06:00' }),
      leg('2026-06-02', 'LIS', 'OPO', '12:00', '13:00', '14:00'),
    ], 'pilot');
    expect(r[1].restMinutes).toBe(28 * 60); // to the 12:00 report, not to the 06:00 standby
  });
});
