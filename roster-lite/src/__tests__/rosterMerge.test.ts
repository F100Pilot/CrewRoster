import { describe, expect, it } from 'vitest';
import { mergeDuties } from '../domain/rosterMerge';
import type { ParsedDuty } from '../domain/types';

const duty = (date: string, dutyCode = 'FLT', flightNumber: string | null = null): ParsedDuty => ({
  date,
  dutyCode,
  dutyType: dutyCode === 'FLT' ? 'Flight Duty' : 'Other',
  reportingTime: null,
  departureTime: null,
  arrivalTime: null,
  flightNumber,
  departureAirport: null,
  arrivalAirport: null,
  aircraftType: null,
  observations: null,
});

const dates = (ds: ParsedDuty[]) => [...new Set(ds.map((d) => d.date))].sort();

describe('mergeDuties', () => {
  it('concatenates non-overlapping downloads (January then February)', () => {
    const jan = [duty('2026-01-10'), duty('2026-01-20')];
    const feb = [duty('2026-02-05'), duty('2026-02-15')];
    const merged = mergeDuties(jan, feb);
    expect(dates(merged)).toEqual(['2026-01-10', '2026-01-20', '2026-02-05', '2026-02-15']);
  });

  it('keeps dates outside the incoming window and replaces those inside', () => {
    const previous = [duty('2026-01-10'), duty('2026-02-10', 'FLT', 'TP100'), duty('2026-03-10')];
    // Re-download February only, with a changed flight number.
    const incoming = [duty('2026-02-10', 'FLT', 'TP999')];
    const merged = mergeDuties(previous, incoming);
    expect(dates(merged)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
    expect(merged.find((d) => d.date === '2026-02-10')?.flightNumber).toBe('TP999');
  });

  it('keeps a day the new download is silent about (never wipes good data)', () => {
    const previous = [duty('2026-02-01'), duty('2026-02-02'), duty('2026-02-03')];
    // New download of the same span no longer lists Feb 2 (a partial/incomplete parse).
    // Feb 2 must be KEPT — a missing date means "not parsed", not "day removed".
    const incoming = [duty('2026-02-01'), duty('2026-02-03')];
    const merged = mergeDuties(previous, incoming);
    expect(dates(merged)).toEqual(['2026-02-01', '2026-02-02', '2026-02-03']);
  });

  it('returns previous unchanged when incoming is empty', () => {
    const previous = [duty('2026-01-10')];
    expect(mergeDuties(previous, [])).toEqual(previous);
  });
});

describe('mergeDuties — planned vs flown', () => {
  const leg = (date: string, off: string, on: string, extra: Partial<ParsedDuty> = {}): ParsedDuty => ({
    ...duty(date, 'FLT', 'TP1940'),
    departureAirport: 'LIS', arrivalAirport: 'OPO', departureTime: off, arrivalTime: on, reportingTime: '06:15',
    ...extra,
  });

  it('keeps the plan when a sync after the day brings the flown times', () => {
    const planned = mergeDuties([], [leg('2026-10-10', '07:00', '08:00')], '2026-10-01');
    expect(planned[0].planned).toBeUndefined();
    expect(planned[0].settled).toBeUndefined();
    const flown = mergeDuties(planned, [leg('2026-10-10', '07:25', '08:30')], '2026-10-12');
    expect(flown[0]).toMatchObject({ departureTime: '07:25', settled: true });
    expect(flown[0].planned).toEqual({ reportingTime: '06:15', departureTime: '07:00', arrivalTime: '08:00' });
  });

  it('keeps the first plan across later syncs, and never takes flown times for a plan', () => {
    const a = mergeDuties([], [leg('2026-10-10', '07:00', '08:00')], '2026-10-01');
    const b = mergeDuties(a, [leg('2026-10-10', '07:25', '08:30')], '2026-10-12');
    const c = mergeDuties(b, [leg('2026-10-10', '07:26', '08:31')], '2026-10-20');
    expect(c[0].planned?.departureTime).toBe('07:00');
    // First seen only after the day: nothing to compare with.
    const late = mergeDuties([], [leg('2026-10-10', '07:25', '08:30')], '2026-10-12');
    const later = mergeDuties(late, [leg('2026-10-10', '07:26', '08:31')], '2026-10-20');
    expect(later[0].planned).toBeUndefined();
  });

  it('on the day itself takes the plan from the earlier version, without settling it', () => {
    const a = mergeDuties([], [leg('2026-10-10', '07:00', '08:00')], '2026-10-09');
    const b = mergeDuties(a, [leg('2026-10-10', '07:25', '08:30')], '2026-10-10');
    expect(b[0].planned?.departureTime).toBe('07:00');
    expect(b[0].settled).toBeUndefined();
    const c = mergeDuties(b, [leg('2026-10-10', '07:25', '08:30')], '2026-10-11');
    expect(c[0]).toMatchObject({ settled: true, planned: { departureTime: '07:00' } });
  });

  it('records nothing when the flight went as planned or the day is still ahead', () => {
    const a = mergeDuties([], [leg('2026-10-10', '07:00', '08:00')], '2026-10-01');
    expect(mergeDuties(a, [leg('2026-10-10', '07:00', '08:00')], '2026-10-12')[0].planned).toBeUndefined();
    // A change to a future day is a roster change, not a delay.
    expect(mergeDuties(a, [leg('2026-10-10', '09:00', '10:00')], '2026-10-05')[0].planned).toBeUndefined();
  });
});
