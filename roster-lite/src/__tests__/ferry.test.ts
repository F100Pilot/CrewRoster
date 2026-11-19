import { describe, expect, it } from 'vitest';
import { DEFAULT_PAY_SETTINGS, payEstimate, type PaySettings } from '../domain/payEstimate';
import { countedDayDuty, PGA_PILOT_RULES } from '../domain/dutyTime';
import { ferrySectors } from '../domain/ferry';
import { interpretPgaGrid } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';
import type { ParsedDuty } from '../domain/types';

// A tester's day (Nov 2026), times as printed: H9+ LIS 0900–1300, GT-TAXI LIS 1400–1420 AVR, a ferry AVR 1538 → LIS 1557
// (FT 00:19, FDP 02:57 from 13:00, DT 04:27). Synthetic flight number in the 9xxx range.
const tok = (text: string, y: number): PositionedToken => ({ text, x: 203, y, width: 6, height: 6, page: 1 });
const head = [
  { text: '01Sep26 -', x: 562, y: 745, width: 6, height: 6, page: 1 }, { text: 'date', x: 496, y: 544, width: 6, height: 6, page: 1 },
  { text: 'Wed09', x: 203, y: 544, width: 6, height: 6, page: 1 }, { text: 'Tue08', x: 232, y: 544, width: 6, height: 6, page: 1 },
];
const day = () => interpretPgaGrid([...head,
  tok('H9+', 520), tok('LIS', 510), tok('0900', 500), tok('1300', 490),
  tok('GT-TAXI', 480), tok('LIS', 470), tok('1400', 460), tok('1420', 450), tok('AVR', 440),
  tok('TP', 430), tok('9750', 420), tok('AVR', 410), tok('1538', 400), tok('1557', 390), tok('LIS', 380), tok('E95', 370),
]).filter((d) => d.date === '2026-09-09');

describe('ground transport before a ferry', () => {
  it('reads GT-TAXI as a timed transfer and puts the report an hour before it', () => {
    const d = day();
    const gt = d.find((x) => x.dutyCode === 'GT-TAXI')!;
    expect([gt.dutyType, gt.departureAirport, gt.arrivalAirport, gt.departureTime, gt.arrivalTime]).toEqual(['Other', 'LIS', 'AVR', '14:00', '14:20']);
    const flight = d.find((x) => x.flightNumber === 'TP9750')!;
    expect(flight.reportingTime).toBe('13:00');
    // 09:00–13:00 at 25% + 13:00–16:27 (on-blocks + 30 min) = 4h27, the printed DT.
    expect(countedDayDuty('2026-09-09', d, PGA_PILOT_RULES)?.minutes).toBe(60 + 207);
  });
});

describe('a ferry counts double (RRRGS cl. 12.2 b ii)', () => {
  const S: PaySettings = { ...DEFAULT_PAY_SETTINGS, enabled: true, vb: 5000, ve: 0, vs: 0, extras: 0 };
  const mark = (ds: ParsedDuty[], ferry?: boolean) => ds.map((x) => (ferry === undefined ? x : { ...x, ferry }));

  it('adds the work window to the duty-pay and the flight time to the block-pay, unless switched off', () => {
    const on = payEstimate(day(), '2026-09', S, '2026-09-30');
    const off = payEstimate(mark(day(), false), '2026-09', S, '2026-09-30');
    expect(on.duty.credited - off.duty.credited).toBe(207);
    expect(on.block.credited - off.block.credited).toBe(19);
    expect(on.duty.ferry).toBe(207);
    expect(off.duty.ferry).toBe(0);
  });

  it('takes only 9xxx flights, and only the ferry sectors on a mixed day', () => {
    const leg = (n: string, off: string, on: string): ParsedDuty => ({
      date: '2026-09-10', dutyType: 'Flight Duty', dutyCode: 'FLT', flightNumber: n, departureAirport: 'LIS', arrivalAirport: 'OPO',
      departureTime: off, arrivalTime: on, reportingTime: null, aircraftType: 'E95', observations: null,
    });
    expect(ferrySectors([leg('TP1940', '08:00', '09:00')])).toEqual([]);
    const mixed = [leg('TP1940', '08:00', '09:00'), leg('TP9741', '10:00', '11:00')];
    expect(ferrySectors(mixed).map((x) => x.flightNumber)).toEqual(['TP9741']);
    const r = payEstimate(mixed, '2026-09', S, '2026-09-30');
    expect([r.duty.ferry, r.block.ferry]).toEqual([60, 60]);
  });
});
