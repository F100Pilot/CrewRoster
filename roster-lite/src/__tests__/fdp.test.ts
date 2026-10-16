import { describe, expect, it } from 'vitest';
import { fdpForDay, fdpTableMax } from '../domain/fdp';
import type { ParsedDuty } from '../domain/types';
import type { RestInfo } from '../domain/restPeriods';

const t = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

function duty(p: Partial<ParsedDuty> & { date: string; dutyType: string }): ParsedDuty {
  return {
    dutyCode: 'FLT', flightNumber: null, departureAirport: null, arrivalAirport: null,
    departureTime: null, arrivalTime: null, reportingTime: null, aircraftType: null,
    observations: null, ...p,
  } as ParsedDuty;
}
const leg = (date: string, from: string, to: string, off: string, on: string, report: string | null = null) =>
  duty({ date, dutyType: 'Flight Duty', departureAirport: from, arrivalAirport: to, departureTime: off, arrivalTime: on, reportingTime: report });
const rest = (date: string, restMinutes: number): RestInfo =>
  ({ date, restMinutes, requiredMinutes: 0, away: true, short: false });

// RUPT cl. 35.1 — the table, by report time (Lisbon) and sectors.
describe('fdpTableMax', () => {
  it.each([
    ['10:00', 2, '13:00'], ['10:00', 3, '12:30'], ['10:00', 4, '12:00'],
    ['13:45', 1, '12:45'], ['14:10', 3, '12:00'], ['16:45', 4, '10:15'],
    ['17:00', 2, '11:00'], ['23:00', 4, '10:00'], ['03:00', 2, '11:00'],
    ['05:00', 2, '12:00'], ['05:20', 3, '11:45'], ['05:50', 4, '11:45'],
  ])('report %s, %i sectors → %s', (report, sectors, max) => {
    expect(fdpTableMax(t(report), sectors)).toBe(t(max));
  });

  it('continues past 4 sectors at −30 min each, down to a 9h floor', () => {
    expect(fdpTableMax(t('10:00'), 6)).toBe(t('11:00'));
    expect(fdpTableMax(t('17:00'), 8)).toBe(t('09:00'));
  });
});

describe('fdpForDay', () => {
  it('measures report → last on-blocks and reads the table in Lisbon time', () => {
    // Summer (UTC+1): report 05:00Z = 06:00 Lisbon → 13:00 for 2 sectors.
    const f = fdpForDay([
      leg('2026-06-10', 'LIS', 'FNC', '06:00', '07:50', '05:00'),
      leg('2026-06-10', 'FNC', 'LIS', '08:40', '10:20'),
    ])!;
    expect(f).toMatchObject({ planned: t('05:20'), max: t('13:00'), sectors: 2, reportLocal: '06:00', rule: 'table' });
  });

  it('uses winter time in winter', () => {
    // Winter (UTC+0): report 05:00Z = 05:00 Lisbon → 12:00.
    const f = fdpForDay([leg('2026-01-15', 'LIS', 'OPO', '06:00', '07:00', '05:00')])!;
    expect(f).toMatchObject({ reportLocal: '05:00', max: t('12:00') });
  });

  it('caps an early start away from base at 6h (cl. 35.3)', () => {
    // FNC, report 04:30Z = 05:30 Lisbon; the 12h of rest before it cannot hold a local night.
    const f = fdpForDay([leg('2026-06-10', 'FNC', 'LIS', '05:30', '07:10', '04:30')], rest('2026-06-10', 12 * 60))!;
    expect(f).toMatchObject({ max: t('06:00'), rule: 'night-away' });
  });

  it('allows 9h when the rest before was at least 16h with a local night', () => {
    // FNC, report 22:30Z = 23:30 Lisbon; 26h of rest cover the whole previous night.
    const f = fdpForDay([leg('2026-06-10', 'FNC', 'LIS', '23:30', '01:10', '22:30')], rest('2026-06-10', 26 * 60))!;
    expect(f).toMatchObject({ max: t('09:00'), rule: 'night-away' });
  });

  it('does not apply the night rule at base', () => {
    const f = fdpForDay([leg('2026-06-10', 'LIS', 'FNC', '05:30', '07:20', '04:30')])!;
    expect(f).toMatchObject({ rule: 'table', max: t('12:30') }); // 05:30 Lisbon band
  });

  it('is null on a day without an operated sector', () => {
    expect(fdpForDay([duty({ date: '2026-06-10', dutyType: 'Positioning', departureTime: '06:00', arrivalTime: '07:00' })])).toBeNull();
  });

  it('flags a day with more sectors than the agreement plans', () => {
    const legs = ['06:00', '08:00', '10:00', '12:00', '14:00'].map((off, i) =>
      leg('2026-06-10', i % 2 ? 'OPO' : 'LIS', i % 2 ? 'LIS' : 'OPO', off, `${String(Number(off.slice(0, 2)) + 1).padStart(2, '0')}:00`, i === 0 ? '05:00' : null));
    expect(fdpForDay(legs)).toMatchObject({ sectors: 5, beyondTable: true });
  });
});

describe('fdpForDay — base do piloto', () => {
  // Report 04:30Z = 05:30 Lisbon, short rest before.
  const early = (from: string, to: string) => [leg('2026-06-10', from, to, '05:30', '07:10', '04:30')];

  it('caps an early start in Lisbon for a Porto pilot (away from base)', () => {
    expect(fdpForDay(early('LIS', 'OPO'), rest('2026-06-10', 12 * 60), 'OPO')).toMatchObject({ rule: 'night-away', max: t('06:00') });
  });

  it('uses the table for an early start in Porto for a Porto pilot (at base)', () => {
    expect(fdpForDay(early('OPO', 'LIS'), rest('2026-06-10', 12 * 60), 'OPO')).toMatchObject({ rule: 'table', max: t('12:30') });
  });
});
