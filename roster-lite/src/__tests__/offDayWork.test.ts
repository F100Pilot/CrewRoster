import { describe, expect, it } from 'vitest';
import { DEFAULT_PAY_SETTINGS, payEstimate, type PaySettings } from '../domain/payEstimate';
import { offDayChoice, restCutOf } from '../domain/offDayWork';
import { interpretPgaGrid } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';
import type { ParsedDuty } from '../domain/types';

// RRRGS cl. 13 (a flight on a planned day off) and cl. 2.8 (a reduced rest) — what the pilot settles
// on the day page. Synthetic flights only.
const S: PaySettings = { ...DEFAULT_PAY_SETTINGS, enabled: true, vb: 5000, ve: 0, vs: 0, extras: 0 };
const leg = (date: string, from: string, to: string, off: string, on: string, x: Partial<ParsedDuty> = {}): ParsedDuty => ({
  date, dutyType: 'Flight Duty', dutyCode: 'FLT', flightNumber: `TP9${from}${to}`, departureAirport: from, arrivalAirport: to,
  departureTime: off, arrivalTime: on, reportingTime: null, aircraftType: 'E90', observations: null, ...x,
});
// A round trip, report 07:00z (dep − 1 h), last on-blocks 12:00z: FDP 5h00.
const trip = (date: string, x: Partial<ParsedDuty> = {}) => [
  leg(date, 'LIS', 'MAD', '08:00', '09:20', { reportingTime: '07:00', ...x }), leg(date, 'MAD', 'LIS', '10:30', '12:00', x),
];

describe('flight on a planned day off (RRRGS cl. 13)', () => {
  it('is paid by default when the roster prints "Voo em Off"; the pilot can keep the day instead', () => {
    expect(offDayChoice(trip('2026-09-29', { observations: 'VOO_OFF' }))).toBe('paid');
    expect(offDayChoice(trip('2026-09-29', { observations: 'VOO_OFF', offDayPay: 'kept' }))).toBe('kept');
    expect(offDayChoice(trip('2026-09-29'))).toBeNull();
    expect(offDayChoice(trip('2026-09-29', { offDayPay: 'paid' }))).toBe('paid');
  });

  it('pays 3% of the VB per FDP hour + 15% of the VB, and keeps those hours out of the plafonds', () => {
    const plain = payEstimate(trip('2026-09-29'), '2026-09', S, '2026-09-30');
    const off = payEstimate(trip('2026-09-29', { observations: 'VOO_OFF' }), '2026-09', S, '2026-09-30');
    expect(off.offDays).toBe(1);
    expect(off.offDayMinutes).toBe(300);
    expect(off.offDayValue).toBeCloseTo(5 * 0.03 * 5000 + 0.15 * 5000, 2); // 750 + 750
    expect(plain.duty.credited).toBeGreaterThan(0);
    expect(off.duty.credited).toBe(0);
    expect(off.block.credited).toBe(0);
    const kept = payEstimate(trip('2026-09-29', { observations: 'VOO_OFF', offDayPay: 'kept' }), '2026-09', S, '2026-09-30');
    expect(kept.offDayValue).toBe(0);
    expect(kept.duty.credited).toBe(plain.duty.credited);
  });
});

describe('reduced rest typed by the pilot (RRRGS cl. 2.8)', () => {
  it('caps at 120 minutes and pays the time cut at 3% of the VB an hour', () => {
    expect(restCutOf(trip('2026-09-29', { restCutMin: 150 }))).toBe(120);
    const r = payEstimate(trip('2026-09-29', { restCutMin: 90 }), '2026-09', S, '2026-09-30');
    expect(r.reducedMinutes).toBe(90);
    expect(r.reductionValue).toBeCloseTo(1.5 * 0.03 * 5000, 2);
  });
});

describe('roster remarks', () => {
  const tok = (text: string, x: number, y: number): PositionedToken => ({ text, x, y, width: 6, height: 6, page: 1 });
  const head = [tok('01Sep26 -', 562, 745), tok('date', 496, 544), tok('Wed09', 203, 544), tok('Tue08', 232, 544)];
  const flight = (extra: PositionedToken[]) => interpretPgaGrid([...head,
    tok('TP', 203, 502), tok('1454', 203, 489), tok('LIS', 203, 440), tok('1355', 203, 419), tok('1530', 203, 398),
    tok('RAK', 203, 380), tok('E95', 203, 360), ...extra,
  ]).filter((d) => d.date === '2026-09-09');

  it('reads "Voo em Off" word by word without making the "Off" a day off', () => {
    const d = flight([tok('Voo', 203, 340), tok('em', 203, 330), tok('Off', 203, 320)]);
    expect(d.map((x) => [x.dutyType, x.flightNumber, x.observations])).toEqual([['Flight Duty', 'TP1454', 'VOO_OFF']]);
  });

  it('reads "Voo em Off" and "Reducao Repouso" in one piece', () => {
    expect(flight([tok('Voo em Off', 203, 340)])[0].observations).toBe('VOO_OFF');
    expect(flight([tok('Reducao Repouso', 203, 340)])[0].observations).toBe('RED_REP');
  });
});
