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

  it('removes a day cleared within the incoming window', () => {
    const previous = [duty('2026-02-01'), duty('2026-02-02'), duty('2026-02-03')];
    // New download of the same window no longer has Feb 2.
    const incoming = [duty('2026-02-01'), duty('2026-02-03')];
    const merged = mergeDuties(previous, incoming);
    expect(dates(merged)).toEqual(['2026-02-01', '2026-02-03']);
  });

  it('returns previous unchanged when incoming is empty', () => {
    const previous = [duty('2026-01-10')];
    expect(mergeDuties(previous, [])).toEqual(previous);
  });
});
