import { describe, expect, it } from 'vitest';
import { countdownTo, diffMinutes, formatDuration, utcDateTime } from '../utils/duration';
import { dayStats } from '../domain/dutyStats';
import type { ParsedDuty } from '../domain/types';

const flight = (over: Partial<ParsedDuty>): ParsedDuty => ({
  date: '2026-06-20',
  dutyCode: 'FLT',
  dutyType: 'Flight Duty',
  reportingTime: null,
  departureTime: null,
  arrivalTime: null,
  flightNumber: null,
  departureAirport: null,
  arrivalAirport: null,
  aircraftType: null,
  observations: null,
  ...over,
});

describe('duration helpers', () => {
  it('diffMinutes computes spans and wraps past midnight', () => {
    expect(diffMinutes('06:15', '09:10')).toBe(175);
    expect(diffMinutes('23:30', '00:45')).toBe(75);
  });

  it('formatDuration reads as a duration, not a clock time', () => {
    expect(formatDuration(175)).toBe('2h55');
    expect(formatDuration(65)).toBe('1h05');
    expect(formatDuration(45)).toBe('45m');
  });

  it('utcDateTime builds a UTC instant', () => {
    expect(utcDateTime('2026-06-20', '06:15').toISOString()).toBe('2026-06-20T06:15:00.000Z');
  });

  it('countdownTo formats remaining time and is null in the past', () => {
    const base = new Date('2026-06-20T00:00:00Z');
    expect(countdownTo(new Date('2026-06-23T05:00:00Z'), base)).toBe('3d 5h');
    expect(countdownTo(new Date('2026-06-20T02:10:00Z'), base)).toBe('2h 10m');
    expect(countdownTo(new Date('2026-06-20T00:05:00Z'), base)).toBe('5m');
    expect(countdownTo(new Date('2026-06-19T23:00:00Z'), base)).toBeNull();
  });
});

describe('dayStats', () => {
  it('sums block time and measures check-in to last arrival', () => {
    const duties = [
      flight({ flightNumber: 'TP1', departureTime: '08:00', arrivalTime: '09:10', reportingTime: '07:00' }),
      flight({ flightNumber: 'TP2', departureTime: '10:00', arrivalTime: '11:30' }),
    ];
    const stats = dayStats(duties)!;
    expect(stats.blockMinutes).toBe(70 + 90);
    expect(stats.checkIn).toBe('07:00');
    expect(stats.dutyMinutes).toBe(diffMinutes('07:00', '11:30'));
  });

  it('returns null when there are no timed flights', () => {
    expect(dayStats([flight({ dutyType: 'Day Off', dutyCode: 'OFF' })])).toBeNull();
  });
});
