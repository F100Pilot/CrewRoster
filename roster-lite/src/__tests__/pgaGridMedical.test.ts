import { describe, expect, it } from 'vitest';
import { interpretPgaGrid } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

const tok = (text: string, x: number, y: number, page = 1): PositionedToken => ({
  text, x, y, width: 6, height: 6, page,
});

// Regression: the aeromedical exam block (IM / VIM / MED) was not in the duty-code table, so a
// day made up only of those slots produced NO duties at all and vanished from the roster
// (real case: 9 Sep with IM 07:00-11:00, VIM 11:00-11:30, MED 11:30-12:00 — three sub-columns).
describe('pgaGrid — medical exam codes', () => {
  // One activity sub-column: code, airport, start, end (stacked top→bottom, as in the grid).
  const slot = (x: number, code: string, t1: string, t2: string): PositionedToken[] => [
    tok(code, x, 502), tok('LIS', x, 440), tok(t1, x, 419), tok(t2, x, 398),
  ];

  const tokens: PositionedToken[] = [
    tok('01Sep26 -', 562, 745), // calendar anchor → Wed09 = 9 Sep 2026
    tok('date', 496, 544),
    tok('Wed09', 203, 544), tok('Tue08', 232, 544),
    ...slot(203, 'IM', '0700', '1100'),  // first slot, under the day header
    ...slot(198, 'VIM', '1100', '1130'), // later slots stack to the LEFT
    ...slot(193, 'MED', '1130', '1200'),
  ];

  const onDay = interpretPgaGrid(tokens).filter((d) => d.date === '2026-09-09');

  it('parses all three medical slots as Medical duties, in time order', () => {
    expect(onDay.map((d) => d.dutyCode)).toEqual(['IM', 'VIM', 'MED']);
    expect(onDay.every((d) => d.dutyType === 'Medical')).toBe(true);
  });

  it('keeps each slot\'s scheduled start/end and the airport', () => {
    expect(onDay.map((d) => [d.departureTime, d.arrivalTime])).toEqual([
      ['07:00', '11:00'], ['11:00', '11:30'], ['11:30', '12:00'],
    ]);
    expect(onDay[0].departureAirport).toBe('LIS');
  });

  it('does not mistake a MED airport inside a flight for a medical duty', () => {
    // A flight routed through MED (Medina) must stay ONE flight, not split into flight + medical.
    const flight = interpretPgaGrid([
      tok('01Sep26 -', 562, 745), tok('date', 496, 544), tok('Wed09', 203, 544),
      tok('TP', 203, 502), tok('100', 203, 489),
      tok('LIS', 203, 440), tok('0700', 203, 419), tok('1100', 203, 398), tok('MED', 203, 380),
      tok('E90', 203, 360),
    ]).filter((d) => d.date === '2026-09-09');
    expect(flight).toHaveLength(1);
    expect(flight[0].flightNumber).toBe('TP100');
    expect([flight[0].departureAirport, flight[0].arrivalAirport]).toEqual(['LIS', 'MED']);
  });
});
