import { describe, expect, it } from 'vitest';
import { AE_FLIGHT_LIMITS, aeFlightDays, aeFlightTime } from '../domain/flightTime';
import type { ParsedDuty } from '../domain/types';

function duty(p: Partial<ParsedDuty> & { date: string; dutyType: string }): ParsedDuty {
  return {
    dutyCode: 'FLT', flightNumber: null, departureAirport: null, arrivalAirport: null,
    departureTime: null, arrivalTime: null, reportingTime: null, aircraftType: null,
    observations: null, ...p,
  } as ParsedDuty;
}

// RUPT cl. 30: 90h per 4 weeks, 270h per calendar quarter, 850h per year; simulator counts.
describe('company-agreement flight time', () => {
  it('keeps the agreement figures', () => {
    expect(AE_FLIGHT_LIMITS).toEqual({ days28: 5400, quarter: 16200, year: 51000 });
  });

  it('counts simulator sessions as flight time (cl. 30.2)', () => {
    const days = aeFlightDays([
      duty({ date: '2026-10-01', dutyType: 'Flight Duty', departureTime: '06:00', arrivalTime: '08:00' }),
      duty({ date: '2026-10-02', dutyType: 'Simulator', dutyCode: 'LIS-EBT-1', departureTime: '17:00', arrivalTime: '21:00' }),
      duty({ date: '2026-10-03', dutyType: 'Positioning', dutyCode: 'DH', departureTime: '06:00', arrivalTime: '08:00' }),
    ]);
    expect(days).toEqual([{ date: '2026-10-01', minutes: 120 }, { date: '2026-10-02', minutes: 240 }]);
  });

  it('measures the worst 28 days, the quarter and the trailing year', () => {
    const duties = Array.from({ length: 10 }, (_, i) =>
      duty({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, dutyType: 'Flight Duty', departureTime: '06:00', arrivalTime: '11:00' }));
    const t = aeFlightTime(duties, '2026-10-05');
    expect(t.days28.minutes).toBe(10 * 300);
    expect(t.quarter).toEqual({ minutes: 10 * 300, label: '4.º trim. 2026' });
    expect(t.year).toBe(5 * 300); // up to the reference day only
  });
});
