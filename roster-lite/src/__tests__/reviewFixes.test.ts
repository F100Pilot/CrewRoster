import { describe, expect, it } from 'vitest';
import { DEFAULT_PAY_SETTINGS, payEstimate, type PaySettings } from '../domain/payEstimate';
import { standbyInterval } from '../domain/dutyTime';
import { legsOf } from '../domain/dayPhase';
import type { ParsedDuty } from '../domain/types';

// Bugs found by the code review of Nov 2026, each pinned by the input that showed it.
const S: PaySettings = { ...DEFAULT_PAY_SETTINGS, enabled: true, vb: 5000, ve: 200, vs: 100, extras: 0 };
const duty = (date: string, dutyType: string, extra: Partial<ParsedDuty> = {}): ParsedDuty =>
  ({ date, dutyType, dutyCode: '', ...extra }) as ParsedDuty;
const leg = (date: string, from: string, to: string, off: string, on: string, report: string | null = null) =>
  duty(date, 'Flight Duty', { flightNumber: `TP9${from}${to}`, departureAirport: from, arrivalAirport: to, departureTime: off, arrivalTime: on, reportingTime: report });

describe('review fixes', () => {
  it('pays the 1 Jan holiday on a 31 Dec duty running past midnight', () => {
    const nye = payEstimate([leg('2026-12-31', 'LIS', 'FNC', '22:00', '02:00', '21:00')], '2026-12', S, '2027-01-31');
    const plain = payEstimate([leg('2026-12-30', 'LIS', 'FNC', '22:00', '02:00', '21:00')], '2026-12', S, '2027-01-31');
    expect(nye.block.credited).toBe(plain.block.credited + 120); // 00:00–02:00 Lisbon of 1 Jan, doubled
    expect(nye.duty.credited).toBeGreaterThan(plain.duty.credited);
  });

  it('places a summer R24 from 00:00 Lisbon, i.e. 23:00Z the day before', () => {
    const iv = standbyInterval(duty('2026-07-10', 'Standby Home', { dutyCode: 'R24' }));
    expect(iv).not.toBeNull();
    expect(iv!.start.toISOString()).toBe('2026-07-09T23:00:00.000Z');
    const winter = standbyInterval(duty('2026-01-10', 'Standby Home', { dutyCode: 'R24' }));
    expect(winter!.start.toISOString()).toBe('2026-01-10T00:00:00.000Z');
  });

  it('orders a leg departing after midnight after the evening one', () => {
    const legs = legsOf('2026-11-10', [leg('2026-11-10', 'LIS', 'FNC', '22:00', '23:45', '21:00'), leg('2026-11-10', 'FNC', 'LIS', '00:45', '02:15')]);
    expect(legs.map((l) => l.duty.departureAirport)).toEqual(['LIS', 'FNC']);
    expect(legs[1].off.toISOString()).toBe('2026-11-11T00:45:00.000Z');
  });

  it('pays no rest cut on a day whose "Reducao Repouso" was switched off', () => {
    // Report 06:00 after a release at 22:30 the day before: 7h30 of rest, under the 12 h minimum at base.
    const d1 = leg('2026-03-09', 'LIS', 'OPO', '20:00', '22:00', '19:00');
    const d2 = leg('2026-03-10', 'LIS', 'OPO', '07:00', '08:00', '06:00');
    const on = payEstimate([d1, { ...d2, observations: 'RED_REP' }], '2026-03', S, '2026-03-31');
    const off = payEstimate([d1, { ...d2, observations: 'RED_REP', restCutMin: -1 }], '2026-03', S, '2026-03-31');
    expect(on.reductionValue).toBeGreaterThan(0);
    expect(off.reductionValue).toBe(0);
  });
});
