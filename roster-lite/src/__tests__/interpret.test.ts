import { describe, expect, it } from 'vitest';
import { interpret } from '../parsing/pdf/interpret';
import type { RosterLine } from '../parsing/pdf/reconstructLines';

// Build a RosterLine from plain text (cells aren't needed for regex-based interpretation).
function line(text: string): RosterLine {
  return { page: 1, y: 0, cells: [], text };
}

describe('interpret (provisional PGA profile)', () => {
  it('extracts a flight duty row with date, flight, route and times', () => {
    const lines = [
      line('Roster June 2026'), // header — ignored (no date)
      line('18/06/2026 FLT TP1920 LIS-OPO 05:30 06:30 07:25'),
      line('19/06/2026 OFF'),
    ];
    const { duties } = interpret(lines);
    expect(duties).toHaveLength(2);
    expect(duties[0]).toMatchObject({
      date: '2026-06-18',
      flightNumber: 'TP1920',
      departureAirport: 'LIS',
      arrivalAirport: 'OPO',
      dutyType: 'Flight Duty',
    });
    expect(duties[0].reportingTime).toBe('05:30');
    expect(duties[1].dutyType).toBe('Day Off');
  });

  it('warns when nothing parses', () => {
    const { duties, warnings } = interpret([line('no dates here'), line('totals: 80h')]);
    expect(duties).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
