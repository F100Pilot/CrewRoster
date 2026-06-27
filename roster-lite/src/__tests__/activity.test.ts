import { describe, it, expect } from 'vitest';
import { groundActivityByDate, activeYears } from '../domain/activity';
import type { LogbookRow, ParsedDuty } from '../domain/types';

const duty = (date: string, dutyType: string): ParsedDuty => ({
  date, dutyCode: 'X', dutyType,
  reportingTime: null, departureTime: null, arrivalTime: null,
  flightNumber: null, departureAirport: null, arrivalAirport: null,
  aircraftType: null, observations: null,
});

describe('groundActivityByDate', () => {
  it('maps simulator, training and office duties; ignores flights/off/standby', () => {
    const m = groundActivityByDate([
      duty('2026-06-01', 'Simulator'),
      duty('2026-06-02', 'Office Duty'),
      duty('2026-06-03', 'Training'),
      duty('2026-06-04', 'Flight Duty'),
      duty('2026-06-05', 'Day Off'),
      duty('2026-06-06', 'Standby Home'),
    ]);
    expect(m.get('2026-06-01')).toBe('sim');
    expect(m.get('2026-06-02')).toBe('office');
    expect(m.get('2026-06-03')).toBe('training');
    expect(m.has('2026-06-04')).toBe(false);
    expect(m.has('2026-06-05')).toBe(false);
    expect(m.has('2026-06-06')).toBe(false);
  });

  it('prefers sim over training over office when a day mixes them', () => {
    const m = groundActivityByDate([
      duty('2026-06-10', 'Office Duty'),
      duty('2026-06-10', 'Simulator'),
      duty('2026-06-11', 'Office Duty'),
      duty('2026-06-11', 'Training'),
    ]);
    expect(m.get('2026-06-10')).toBe('sim');
    expect(m.get('2026-06-11')).toBe('training');
  });
});

describe('activeYears', () => {
  const row = (date: string): LogbookRow => ({ key: date, date } as LogbookRow);
  it('includes years from flights and any extra (ground) dates, newest first', () => {
    expect(activeYears([row('2025-03-01')], ['2026-02-01', '2024-12-31'])).toEqual([2026, 2025, 2024]);
  });
  it('still works with no extra dates', () => {
    expect(activeYears([row('2025-03-01'), row('2026-01-01')])).toEqual([2026, 2025]);
  });
});
