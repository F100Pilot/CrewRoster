import { describe, expect, it } from 'vitest';
import { accentFor, dayContext, dayDestination, legsOf, skyAt, cityName } from '../domain/dayPhase';
import type { ParsedDuty } from '../domain/types';

const duty = (date: string, dutyType: string, extra: Partial<ParsedDuty> = {}): ParsedDuty => ({
  date, dutyType, dutyCode: dutyType === 'Day Off' ? 'FOL' : 'X',
  reportingTime: null, departureTime: null, arrivalTime: null, flightNumber: null,
  departureAirport: null, arrivalAirport: null, aircraftType: null, observations: null, ...extra,
});
const leg = (date: string, from: string, to: string, off: string, on: string, report: string | null = null) =>
  duty(date, 'Flight Duty', { flightNumber: `TP${from}${to}`, departureAirport: from, arrivalAirport: to, departureTime: off, arrivalTime: on, reportingTime: report });

// A day trip LIS–OPO–LIS (times UTC), and a night in Funchal the next day.
const roster: ParsedDuty[] = [
  leg('2026-11-10', 'LIS', 'OPO', '07:00', '07:55', '06:00'),
  leg('2026-11-10', 'OPO', 'LIS', '08:45', '09:45'),
  leg('2026-11-11', 'LIS', 'FNC', '17:00', '18:45', '16:00'),
  leg('2026-11-12', 'FNC', 'LIS', '08:00', '09:40', '07:00'),
  duty('2026-11-13', 'Day Off'),
  duty('2026-11-14', 'Day Off'),
];
const at = (iso: string) => new Date(iso);

describe('dayContext', () => {
  it('is pre-flight before the report, with the day\'s legs', () => {
    const c = dayContext(roster, at('2026-11-10T04:30:00Z'), 'LIS');
    expect(c.phase).toBe('preflight');
    expect(c.date).toBe('2026-11-10');
    expect(c.legs.map((l) => l.duty.arrivalAirport)).toEqual(['OPO', 'LIS']);
    expect(c.nextLeg?.duty.flightNumber).toBe('TPLISOPO');
  });

  it('is on duty between report and the end, with the airborne leg', () => {
    const c = dayContext(roster, at('2026-11-10T07:30:00Z'), 'LIS');
    expect(c.phase).toBe('duty');
    expect(c.currentLeg?.duty.arrivalAirport).toBe('OPO');
    expect(c.nextLeg?.duty.departureAirport).toBe('OPO');
    // On the ground between legs: nothing airborne, the next one is known.
    const g = dayContext(roster, at('2026-11-10T08:15:00Z'), 'LIS');
    expect(g.currentLeg).toBeNull();
    expect(g.location).toBe('OPO');
  });

  it('is a layover when the night is spent away from base', () => {
    const c = dayContext(roster, at('2026-11-11T22:00:00Z'), 'LIS');
    expect(c.phase).toBe('layover');
    expect(c.location).toBe('FNC');
    expect(c.date).toBe('2026-11-12'); // the duty that brings the crew home
    expect(c.lastEnd).not.toBeNull();
  });

  it('is off on a free day far from the next report, and follows the profile\'s base', () => {
    expect(dayContext(roster, at('2026-11-13T12:00:00Z'), 'LIS').phase).toBe('off');
    // A Porto-based pilot who ended the day in Lisbon is away from base.
    expect(dayContext(roster, at('2026-11-10T12:00:00Z'), 'OPO').phase).toBe('layover');
  });

  it('is standby when the only duty is a standby', () => {
    const sby = [duty('2026-11-20', 'Standby Home', { dutyCode: 'H7+', reportingTime: '07:00', arrivalTime: '15:00' })];
    expect(dayContext(sby, at('2026-11-20T09:00:00Z'), 'LIS').phase).toBe('standby');
  });
});

describe('dayPhase helpers', () => {
  it('rolls a leg past midnight into the next day', () => {
    const [l] = legsOf('2026-11-10', [leg('2026-11-10', 'LIS', 'FNC', '23:10', '00:55')]);
    expect(l.on.toISOString()).toBe('2026-11-11T00:55:00.000Z');
  });

  it('reads the sky from the sun at the airport', () => {
    expect(skyAt('LIS', at('2026-11-10T13:00:00Z')).sky).toBe('day');
    expect(skyAt('LIS', at('2026-11-10T23:00:00Z')).sky).toBe('night');
    expect(skyAt('LIS', at('2026-11-10T07:10:00Z')).sky).toBe('dawn'); // sunrise ≈ 07:20 UTC
  });

  it('colours the day by its destination', () => {
    const legs = legsOf('2026-11-11', [leg('2026-11-11', 'LIS', 'FNC', '17:00', '18:45')]);
    expect(dayDestination(legs, 'LIS')).toBe('FNC');
    expect(accentFor('FNC', 'LIS')).toBe('islands');
    expect(accentFor('FAO', 'LIS')).toBe('south');
    expect(accentFor('FRA', 'LIS')).toBe('north');
    expect(accentFor(null, 'LIS')).toBe('base');
    expect(cityName('fnc')).toBe('Funchal');
  });
});
