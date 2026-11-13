import { describe, expect, it } from 'vitest';
import { autoPrevenir, isPrevenirIO } from '../irregularity';
import { mergeDuties } from '../rosterMerge';
import { dutyDays, PGA_PILOT_RULES } from '../dutyTime';
import { DEFAULT_PAY_SETTINGS, payEstimate } from '../payEstimate';
import type { ParsedDuty } from '../types';

// IO (irregularidade operacional) and the "prevenir" — a colleague's report (Nov 2026): called at
// the report for the alcohol test, the planned flight isn't flown; the roster shows IO from the
// report. The day counts in full. Synthetic flight numbers.
const d = (x: Partial<ParsedDuty>): ParsedDuty => ({
  date: '2026-11-01', dutyCode: 'FLT', dutyType: 'Flight Duty', reportingTime: null, departureTime: null,
  arrivalTime: null, flightNumber: null, departureAirport: null, arrivalAirport: null, aircraftType: 'E90',
  observations: null, ...x,
});
const planned = [
  d({ flightNumber: 'TP9101', departureAirport: 'LIS', arrivalAirport: 'RAK', departureTime: '11:15', arrivalTime: '12:55', reportingTime: '10:15' }),
  d({ flightNumber: 'TP9102', departureAirport: 'RAK', arrivalAirport: 'LIS', departureTime: '13:45', arrivalTime: '15:30' }),
];
const io = (start = '10:15') => d({ dutyType: 'Other', dutyCode: 'IO', departureAirport: 'LIS', reportingTime: start, departureTime: start, arrivalTime: '16:40' });

describe('IO / prevenir', () => {
  it('keeps the planned report on the IO that replaces the day, and reads the prevenir from it', () => {
    const [merged] = mergeDuties(planned, [io()], '2026-11-01');
    expect(merged.planned?.reportingTime).toBe('10:15');
    expect(isPrevenirIO(merged)).toBe(true);
  });

  it('an IO starting at another time is not the prevenir — unless the crew member marks it', () => {
    const [merged] = mergeDuties(planned, [io('12:00')], '2026-11-02');
    expect(autoPrevenir(merged)).toBe(false);
    expect(isPrevenirIO(merged)).toBe(false);
    expect(isPrevenirIO({ ...merged, prevenir: true })).toBe(true);
    expect(isPrevenirIO({ ...mergeDuties(planned, [io()])[0], prevenir: false })).toBe(false);
  });

  it('a later download showing the same IO keeps the plan', () => {
    const first = mergeDuties(planned, [io()], '2026-11-01');
    const again = mergeDuties(first, [io()], '2026-11-05');
    expect(again[0].planned?.reportingTime).toBe('10:15');
    expect(isPrevenirIO(again[0])).toBe(true);
  });

  it('without an earlier download there is nothing to compare: not the prevenir until marked', () => {
    const [only] = mergeDuties([], [io()], '2026-11-01');
    expect(only.planned).toBeUndefined();
    expect(isPrevenirIO(only)).toBe(false);
  });

  it('the IO counts as duty for its whole period (10:15–16:40 = 6h25)', () => {
    const [day] = dutyDays([io()], PGA_PILOT_RULES);
    expect(day.minutes).toBe(6 * 60 + 25);
  });

  it('the prevenir pays per diem A, national (at base: no exempt part)', () => {
    const prevenir = { ...io(), prevenir: true };
    const r = payEstimate([prevenir], '2026-11', DEFAULT_PAY_SETTINGS, '2026-11-30');
    expect(r.perDiemA).toBe(1);
    expect(r.perDiemTravelDays).toBe(0);
    expect(payEstimate([io()], '2026-11', DEFAULT_PAY_SETTINGS, '2026-11-30').perDiemA).toBe(0);
  });
});
