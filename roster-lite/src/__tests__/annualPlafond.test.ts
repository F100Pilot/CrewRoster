import { describe, expect, it } from 'vitest';
import { ANNUAL_BLOCK_MIN, ANNUAL_DUTY_MIN, annualPlafond } from '../domain/annualPlafond';
import { DEFAULT_PAY_SETTINGS, payEstimate, RATE_L1, type PaySettings } from '../domain/payEstimate';
import type { ParsedDuty } from '../domain/types';

const S: PaySettings = { ...DEFAULT_PAY_SETTINGS, enabled: true, vb: 5000, ve: 0, vs: 0, extras: 0 };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const flight = (date: string): ParsedDuty => ({
  date, dutyType: 'Flight Duty', dutyCode: 'FLT', flightNumber: 'TP1234', departureAirport: 'LIS', arrivalAirport: 'OPO',
  departureTime: '08:00', arrivalTime: '14:00', reportingTime: '07:00', aircraftType: 'E95', observations: null,
});

describe('annual plafonds (RRRGS cl. 2.2 b / 2.4)', () => {
  it('sums the months, values the hours above 1136:40 / 624:00 at 3% of the VB and takes off what the months paid', () => {
    // A synthetic year with a flight every day (far above both yearly credits).
    const duties: ParsedDuty[] = [];
    for (let d = new Date('2026-01-01T12:00:00Z'); d.getUTCFullYear() === 2026; d = new Date(d.getTime() + 86_400_000)) duties.push(flight(iso(d)));
    const a = annualPlafond(duties, 2026, () => S, '2027-01-15', 'LIS');
    expect(a.months).toHaveLength(12);
    const jan = payEstimate(duties, '2026-01', S, '2027-01-15', 'LIS');
    expect(a.months[0]).toMatchObject({ duty: jan.duty.credited, block: jan.block.credited, paid: jan.overtimeValue });
    expect(a.duty).toBe(a.months.reduce((x, m) => x + m.duty, 0));
    const dutyValue = ((a.duty - ANNUAL_DUTY_MIN) / 60) * RATE_L1 * 5000;
    const blockValue = ((a.block - ANNUAL_BLOCK_MIN) / 60) * RATE_L1 * 5000;
    expect(a.annualValue).toBeCloseTo(Math.max(dutyValue, blockValue), 1);
    expect(a.balance).toBeCloseTo(Math.max(0, a.annualValue - a.monthlyPaid), 1);
  });

  it('pays nothing below the yearly credits and leaves out the months without a roster', () => {
    const a = annualPlafond([flight('2026-03-10')], 2026, () => S, '2026-12-01', 'LIS');
    expect(a.months.map((m) => m.month)).toEqual(['2026-03']);
    expect([a.annualValue, a.balance, a.best]).toEqual([0, 0, null]);
  });
});

describe('meal card on a simulator day at base (ROV 4.5.9 n.º 1)', () => {
  it('counts one, like a ground day; not away from base', () => {
    const sim: ParsedDuty = {
      date: '2026-11-21', dutyType: 'Simulator', dutyCode: 'LIS-EBT-1', flightNumber: null, departureAirport: 'LIS', arrivalAirport: null,
      departureTime: '09:00', arrivalTime: '13:00', reportingTime: '09:00', aircraftType: null, observations: null,
    };
    expect(payEstimate([sim], '2026-11', S, '2026-11-30', 'LIS').mealTicketDays).toBe(1);
    expect(payEstimate([flight('2026-11-21')], '2026-11', S, '2026-11-30', 'LIS').mealTicketDays).toBe(0);
  });
});
