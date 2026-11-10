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

  it('counts the night of a stay that starts after midnight (a late arrival in Praia, 14 €)', () => {
    // LIS 22:00 → RAI 00:15 local (UTC−1), back the next morning: the stay holds no midnight.
    const days = raacoDays([
      leg('2026-11-20', 'TP9031', 'LIS', 'RAI', '21:00', '01:15', '20:00'),
      leg('2026-11-21', 'TP9032', 'RAI', 'LIS', '11:00', '15:00', '10:00'),
    ], 'LIS');
    const d = days.get('2026-11-20')!;
    expect(d.nights).toEqual([{ date: '2026-11-20', where: 'RAI', value: 14 }]);
    expect(d.stay).toBe('RAI');
  });

  it('pays both nights of a stay with a day X (no duty away), late arrival or not', () => {
    // LIS 22:00 → RAI 00:15 local, a day X in Praia, back on the following night.
    const late = raacoDays([
      leg('2026-11-20', 'TP9041', 'LIS', 'RAI', '21:00', '01:15', '20:00'),
      base('2026-11-21', { dutyType: 'Day Off', dutyCode: 'X' }),
      leg('2026-11-22', 'TP9042', 'RAI', 'LIS', '02:00', '06:00', '01:00'),
    ], 'LIS');
    expect([...late.values()].flatMap((d) => d.nights.map((n) => `${n.date} ${n.where} ${n.value}`)))
      .toEqual(['2026-11-20 RAI 14', '2026-11-21 RAI 14']);
    // An evening arrival in Funchal, a day X, back two days later in the morning.
    const early = raacoDays([
      leg('2026-11-20', 'TP9043', 'LIS', 'FNC', '19:00', '20:45', '18:00'),
      base('2026-11-21', { dutyType: 'Day Off', dutyCode: 'X' }),
      leg('2026-11-22', 'TP9044', 'FNC', 'LIS', '08:00', '09:30', '07:00'),
    ], 'LIS');
    expect([...early.values()].flatMap((d) => d.nights.map((n) => n.date))).toEqual(['2026-11-20', '2026-11-21']);
    expect(early.get('2026-11-21')!.stay).toBe('FNC');
  });

  it('pays the first night when the last sector lands just before local midnight (Dublin, Valencia)', () => {
    // Landing 23:43 in Dublin, released 00:13; a day X; home at 04:33 local two days later.
    const dub = raacoDays([
      leg('2026-09-26', 'TP9051', 'LIS', 'TLS', '13:57', '15:42', '12:57'),
      leg('2026-09-26', 'TP9052', 'TLS', 'LIS', '16:33', '18:28'),
      leg('2026-09-26', 'TP9053', 'LIS', 'DUB', '20:17', '22:43'),
      base('2026-09-27', { dutyType: 'Day Off', dutyCode: 'X' }),
      leg('2026-09-28', 'TP9054', 'DUB', 'LIS', '04:33', '07:26', '03:33'),
    ], 'LIS');
    expect(cols(dub.get('2026-09-26'))).toEqual([0, 0, 0, 45]); // supper 35 + night 10
    expect(cols(dub.get('2026-09-27'))).toEqual([0, 35, 35, 45]);
    const vlc = raacoDays([
      leg('2026-10-14', 'TP9061', 'LIS', 'OPO', '15:47', '16:32', '14:47'),
      leg('2026-10-14', 'TP9062', 'OPO', 'LIS', '17:29', '18:22'),
      leg('2026-10-14', 'TP9063', 'LIS', 'VLC', '20:25', '21:42'),
      base('2026-10-15', { dutyType: 'Day Off', dutyCode: 'X' }),
      leg('2026-10-16', 'TP9064', 'VLC', 'LIS', '03:54', '05:25', '02:54'),
    ], 'LIS');
    expect(cols(vlc.get('2026-10-14'))).toEqual([0, 0, 33, 43]);
    expect(cols(vlc.get('2026-10-15'))).toEqual([0, 33, 33, 43]);
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
