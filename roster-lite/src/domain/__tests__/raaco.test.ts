import { describe, expect, it } from 'vitest';
import { raacoDays, rateAt, countryOf } from '../raaco';
import type { ParsedDuty } from '../types';

// Synthetic rosters shaped like the lines of a real "Abonos Operacionais" statement (May 2026);
// times are made up, the expected columns are the ones the company paid for that kind of day.
const base = (date: string, x: Partial<ParsedDuty>): ParsedDuty => ({
  date, dutyCode: 'FLT', dutyType: 'Flight Duty', flightNumber: null, departureAirport: null, arrivalAirport: null,
  departureTime: null, arrivalTime: null, reportingTime: null, aircraftType: 'E90', observations: null, ...x,
} as ParsedDuty);
const leg = (date: string, fn: string, a: string, z: string, off: string, on: string, rep: string | null = null) =>
  base(date, { flightNumber: fn, departureAirport: a, arrivalAirport: z, departureTime: off, arrivalTime: on, reportingTime: rep });
const cols = (d: { breakfast: number; lunch: number; dinner: number; supperNight: number } | undefined) =>
  d && [d.breakfast, d.lunch, d.dinner, d.supperNight];

describe('Tabela 34', () => {
  it('names the country of an airport and its rates', () => {
    expect(countryOf('FRA')).toBe('Alemanha');
    expect(countryOf('FNC')).toBe('Portugal (fora da base)');
    expect(rateAt('AGP')).toEqual({ breakfast: 18, main: 33, night: 10 });
    expect(rateAt('RAK')).toBeNull(); // Marrocos is not in the table
  });
});

describe('raacoDays', () => {
  it('pays a Frankfurt stay at the German rate, including the simulator day in between', () => {
    const days = raacoDays([
      leg('2026-05-03', 'TP0570', 'LIS', 'FRA', '06:00', '08:45', '05:15'),
      base('2026-05-04', { dutyType: 'Simulator', dutyCode: 'SIM', departureAirport: 'FRA', departureTime: '07:00', arrivalTime: '11:00' }),
      leg('2026-05-05', 'TP0571', 'FRA', 'LIS', '11:30', '14:15', '10:45'),
    ], 'LIS');
    // Breakfast loaded on the way out; lunch, dinner, supper + night stop in FRA.
    expect(cols(days.get('2026-05-03'))).toEqual([0, 39, 39, 49]);
    expect(days.get('2026-05-03')!.stay).toBe('FRA');
    expect(cols(days.get('2026-05-04'))).toEqual([0, 39, 39, 49]);
    expect(days.get('2026-05-04')!.start).toBe('SIM');
    // The day back: lunch at the hotel before the flight (the stay ends after 12:30 local).
    expect(cols(days.get('2026-05-05'))).toEqual([0, 39, 0, 0]);
  });

  it('pays a short-sector breakfast at 5 € and a Málaga night at the Spanish rate', () => {
    const days = raacoDays([
      leg('2026-05-26', 'TP1134', 'LIS', 'AGP', '06:15', '07:30', '05:30'),
      leg('2026-05-27', 'TP1139', 'AGP', 'LIS', '06:00', '07:20', '05:15'),
    ], 'LIS');
    expect(cols(days.get('2026-05-26'))).toEqual([5, 33, 33, 43]);
    expect(cols(days.get('2026-05-27'))).toEqual([5, 0, 0, 0]);
    expect(days.get('2026-05-26')!.total).toBe(114);
  });

  it('pays lunch at 18 € on a day trip of sectors up to 1h30', () => {
    const days = raacoDays([
      leg('2026-05-16', 'TP1452', 'LIS', 'OPO', '11:15', '12:10', '10:30'),
      leg('2026-05-16', 'TP1453', 'OPO', 'LIS', '13:00', '13:55'),
    ], 'LIS');
    expect(cols(days.get('2026-05-16'))).toEqual([0, 18, 0, 0]);
    expect(days.get('2026-05-16')!.meals[0].how).toBe('allowance');
  });

  it('loads the meal on a sector over 1h30 (nothing to pay)', () => {
    const days = raacoDays([
      leg('2026-05-11', 'TP1689', 'LIS', 'FNC', '11:20', '13:05', '10:35'),
      leg('2026-05-11', 'TP1690', 'FNC', 'LIS', '14:00', '15:30'),
    ], 'LIS');
    const d = days.get('2026-05-11')!;
    expect(d.total).toBe(0);
    expect(d.meals.map((m) => [m.meal, m.how, m.where])).toEqual([['lunch', 'onboard', 'TP1689']]);
  });

  it('gives at most one meal for a duty of 3 h or less', () => {
    // 04:00–07:00 LIS: starts inside the supper window and ends after breakfast opens — one meal.
    const days = raacoDays([
      leg('2026-05-12', 'TP1900', 'LIS', 'OPO', '03:45', '04:40', '03:00'),
      leg('2026-05-12', 'TP1901', 'OPO', 'LIS', '05:00', '05:30'),
    ], 'LIS');
    expect(days.get('2026-05-12')!.meals).toHaveLength(1);
  });

  it('gives nothing for standby at home and treats airport standby as duty', () => {
    const home = raacoDays([base('2026-05-14', { dutyType: 'Standby Home', dutyCode: 'H7+', departureTime: '11:00', arrivalTime: '19:00' })], 'LIS');
    expect(home.size).toBe(0);
    const airport = raacoDays([base('2026-05-15', { dutyType: 'Standby Airport', dutyCode: 'SBY', departureTime: '11:00', arrivalTime: '17:00' })], 'LIS');
    expect(cols(airport.get('2026-05-15'))).toEqual([0, 18, 0, 0]);
  });
});
