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

  // The cases crew members reported (Praia, day X, Dublin, Valencia, Barcelona…) live in the
  // casebook, raacoCases.test.ts, with what was reported and the rule each one fixed.

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

  it('pays a DHC meal: the local rate when it ends the duty away, Tabela 33 when it comes home', () => {
    const dh = (date: string, fn: string, a: string, z: string, off: string, on: string, rep: string | null = null) =>
      base(date, { dutyType: 'Positioning', dutyCode: 'DH', flightNumber: fn, departureAirport: a, arrivalAirport: z, departureTime: off, arrivalTime: on, reportingTime: rep });
    const away = raacoDays([dh('2026-05-03', 'TP9001', 'LIS', 'FRA', '07:25', '10:21', '06:25')], 'LIS');
    // Report 07:25 LIS: breakfast, on a DHC that ends in Frankfurt → the German breakfast rate.
    expect(away.get('2026-05-03')!.breakfast).toBe(22);
    const home = raacoDays([
      leg('2026-05-28', 'TP9002', 'LIS', 'FNC', '13:19', '15:00', '12:19'),
      dh('2026-05-28', 'TP9003', 'FNC', 'LIS', '19:09', '20:55'),
    ], 'LIS');
    // Lunch loaded on the first sector (the duty starts in the window), dinner on the DHC home: 18 €.
    expect(cols(home.get('2026-05-28'))).toEqual([0, 0, 18, 0]);
  });

  it('does not carry a breakfast on a sector far from its window', () => {
    // Report 06:56 LIS (breakfast), first sectors of 59 and 67 min, then two longer ones around noon.
    const days = raacoDays([
      leg('2026-05-23', 'TP9011', 'LIS', 'SVQ', '06:56', '07:55', '05:56'),
      leg('2026-05-23', 'TP9012', 'SVQ', 'LIS', '08:48', '09:55'),
      leg('2026-05-23', 'TP9013', 'LIS', 'IBZ', '10:51', '12:33'),
      leg('2026-05-23', 'TP9014', 'IBZ', 'LIS', '13:38', '15:42'),
    ], 'LIS');
    expect(cols(days.get('2026-05-23'))).toEqual([5, 0, 0, 0]);
    expect(days.get('2026-05-23')!.meals.find((m) => m.meal === 'lunch')!.where).toBe('TP9013');
  });

  it('decides on the planned times when a later sync replaced them with the flown ones', () => {
    const flown = { ...leg('2026-05-16', 'TP9021', 'LIS', 'OPO', '11:45', '12:40', '11:00'), planned: { reportingTime: '10:30', departureTime: '11:15', arrivalTime: '12:10' } };
    const days = raacoDays([flown, leg('2026-05-16', 'TP9022', 'OPO', 'LIS', '13:00', '13:55')], 'LIS');
    expect(days.get('2026-05-16')!.lunch).toBe(18);
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

// The Meal Plan sees the PSV as a whole (4.5.10.1; user, 0.9.3.27–28): breakfast on the first sector, each
// later meal on a later sector — and a sector flying through a meal's window carries THAT meal, however early
// the duty began ("se um dos voos cair em cima do período do jantar, o jantar embarca").
describe('Meal Plan over the whole PSV', () => {
  it('loads the dinner on the evening sector of a duty that began in the morning', () => {
    const d = raacoDays([
      leg('2026-10-20', 'TP9201', 'LIS', 'FNC', '07:00', '08:45', '06:00'),
      leg('2026-10-20', 'TP9202', 'FNC', 'LIS', '09:30', '11:05'),
      leg('2026-10-20', 'TP9203', 'LIS', 'BCN', '15:30', '17:20'),
      leg('2026-10-20', 'TP9204', 'BCN', 'LIS', '19:00', '21:00'),
    ], 'LIS').get('2026-10-20')!;
    const where = Object.fromEntries(d.meals.map((m) => [m.meal, `${m.how} ${m.where}`]));
    expect(where).toMatchObject({ breakfast: 'onboard TP9201', lunch: 'onboard TP9202', dinner: 'onboard TP9204' });
  });

  it('keeps the dinner sector for the dinner: a lunch with no sector of its own is paid', () => {
    const d = raacoDays([
      leg('2026-10-21', 'TP9211', 'LIS', 'OPO', '12:15', '13:00', '11:15'),
      leg('2026-10-21', 'TP9212', 'OPO', 'LIS', '17:00', '17:50'),
      leg('2026-10-21', 'TP9213', 'LIS', 'FNC', '19:30', '21:15'),
    ], 'LIS').get('2026-10-21')!;
    expect(d.meals.find((m) => m.meal === 'lunch')).toMatchObject({ how: 'allowance' });
    expect(d.meals.find((m) => m.meal === 'dinner')).toMatchObject({ how: 'onboard', where: 'TP9213' });
  });
});
