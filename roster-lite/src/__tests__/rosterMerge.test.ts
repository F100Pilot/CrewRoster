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

  it('clears a stored day the new download shows blank (a flight removed, nothing printed)', () => {
    const previous = [duty('2026-09-28', 'GAB1'), duty('2026-09-29', 'FLT', 'TP9001'), duty('2026-09-30', 'OFF')];
    const incoming = [duty('2026-09-28', 'GAB1'), duty('2026-09-30', 'OFF')];
    // Without the blank list a silent day is kept (a partial parse must not wipe it)…
    expect(dates(mergeDuties(previous, incoming))).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
    // …but a day the PDF shows empty is gone.
    expect(dates(mergeDuties(previous, incoming, '2026-10-31', ['2026-09-29']))).toEqual(['2026-09-28', '2026-09-30']);
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

  it('keeps the planned report on a delayed day (the derived report would follow the late departure)', () => {
    const planned = mergeDuties([], [leg('2026-05-02', '08:00', '10:20', { reportingTime: '07:00' })], '2026-04-28');
    const flown = mergeDuties(planned, [leg('2026-05-02', '08:12', '10:31', { reportingTime: '07:12' })], '2026-05-05');
    expect(flown[0]).toMatchObject({ reportingTime: '07:00', departureTime: '08:12', settled: true });
    expect(flown[0].planned?.reportingTime).toBe('07:00');
    // And it stays so across later syncs.
    const again = mergeDuties(flown, [leg('2026-05-02', '08:12', '10:31', { reportingTime: '07:12' })], '2026-05-20');
    expect(again[0].reportingTime).toBe('07:00');
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

// Nov 2026, a colleague's October: the app had only the flown times (synced after the days), so the Meal Plan read the
// flown blocks (RAK→LIS 1h23, PXO→LIS 1h29: "no meal") instead of the planned ones (1h40, 1h35). Importing the
// original roster, printed on 15/09, must lend those plans — not replace the flown days.
describe('mergeDuties — an older roster imported later', () => {
  const leg = (date: string, off: string, on: string, extra: Partial<ParsedDuty> = {}): ParsedDuty => ({
    ...duty(date, 'FLT', 'TP1453'),
    departureAirport: 'RAK', arrivalAirport: 'LIS', departureTime: off, arrivalTime: on, reportingTime: null,
    ...extra,
  });

  it('keeps the flown day and takes the old times as its plan', () => {
    const flown = mergeDuties([], [leg('2026-10-14', '10:52', '12:15')], '2026-11-14');
    expect(flown[0].settled).toBe(true);
    const withPlan = mergeDuties(flown, [leg('2026-10-14', '10:45', '12:25')], '2026-09-15');
    expect(withPlan).toHaveLength(1);
    expect(withPlan[0]).toMatchObject({ departureTime: '10:52', arrivalTime: '12:15', settled: true });
    expect(withPlan[0].planned).toMatchObject({ departureTime: '10:45', arrivalTime: '12:25' });
  });

  it('never replaces a newer plan of a day still ahead, and fills days it lacked', () => {
    const now = mergeDuties([], [leg('2026-11-20', '09:00', '10:30')], '2026-11-14');
    const old = mergeDuties(now, [leg('2026-11-20', '08:00', '09:30'), leg('2026-11-21', '08:00', '09:30')], '2026-09-15', [], true);
    expect(old.find((d) => d.date === '2026-11-20')).toMatchObject({ departureTime: '09:00' });
    expect(old.find((d) => d.date === '2026-11-20')!.planned).toBeUndefined();
    expect(old.find((d) => d.date === '2026-11-21')).toMatchObject({ departureTime: '08:00' });
  });
});

// The abonos warn on a flown day whose plan the app never saw (user, Nov 2026). `planned` is kept only when it differs,
// so `planKnown` tells "flown as planned" from "no plan".
describe('mergeDuties — was the plan seen?', () => {
  const leg = (date: string, off: string, on: string): ParsedDuty => ({
    ...duty(date, 'FLT', 'TP1940'), departureAirport: 'LIS', arrivalAirport: 'OPO', departureTime: off, arrivalTime: on,
  });
  it('knows the plan of a day flown as planned, and of a delayed one', () => {
    const plan = mergeDuties([], [leg('2026-10-10', '07:00', '08:00'), leg('2026-10-11', '07:00', '08:00')], '2026-10-01');
    const flown = mergeDuties(plan, [leg('2026-10-10', '07:00', '08:00'), leg('2026-10-11', '07:30', '08:30')], '2026-10-12');
    expect(flown.map((d) => [d.settled, d.planKnown, !!d.planned])).toEqual([[true, true, false], [true, true, true]]);
  });
  it('does not know it when the first roster seen came after the day — until the original is imported', () => {
    const flown = mergeDuties([], [leg('2026-10-10', '07:00', '08:00')], '2026-10-12');
    expect(flown[0].planKnown).toBeUndefined();
    const original = mergeDuties(flown, [leg('2026-10-10', '07:00', '08:00')], '2026-09-15');
    expect(original[0].planKnown).toBe(true);
  });
});
