import { describe, expect, it } from 'vitest';
import { interpretPgaGrid } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

const tok = (text: string, x: number, y: number, page = 1): PositionedToken => ({
  text, x, y, width: 6, height: 6, page,
});

// Regression: from Sep 2026 the Lisbon simulator uses new NetLine codes — LIS-EBT-1 / LIS-EBT-2
// (EBT session day 1 / day 2) and LIS-OTHER (outside the EBT scheme) — instead of E90-LIS-1.
// They were unclassified, so the day fell through to the generic fallback, which picked the
// aircraft token as the code: the roster showed "E90 · Other" with the session start as check-in.
describe('pgaGrid — new simulator codes (EBT)', () => {
  // One session column, laid out as in the PDF: code, airport, start, end, aircraft.
  const session = (x: number, code: string, t1: string, t2: string): PositionedToken[] => [
    tok(code, x, 502), tok('LIS', x, 440), tok(t1, x, 419), tok(t2, x, 398), tok('E90', x, 357),
  ];

  const duties = interpretPgaGrid([
    tok('01Sep26 -', 562, 745),
    tok('date', 496, 544),
    tok('Tue01', 203, 544), tok('Wed02', 232, 544),
    ...session(203, 'LIS-EBT-1', '1510', '1910'),
    ...session(232, 'LIS-EBT-2', '1110', '1510'),
  ]);
  const on = (d: string) => duties.filter((x) => x.date === d);

  it('classifies LIS-EBT-1 as a Simulator session, keeping the code', () => {
    const [s] = on('2026-09-01');
    expect(s).toMatchObject({ dutyCode: 'LIS-EBT-1', dutyType: 'Simulator', departureAirport: 'LIS' });
  });

  it('keeps the session start/end instead of treating the start as a check-in', () => {
    expect(on('2026-09-01')[0]).toMatchObject({ departureTime: '15:10', arrivalTime: '19:10' });
    expect(on('2026-09-02')[0]).toMatchObject({ dutyCode: 'LIS-EBT-2', departureTime: '11:10', arrivalTime: '15:10' });
  });

  it('classifies LIS-OTHER (a session outside the EBT scheme) too', () => {
    const d = interpretPgaGrid([
      tok('01Sep26 -', 562, 745), tok('date', 496, 544), tok('Tue01', 203, 544),
      ...session(203, 'LIS-OTHER', '0800', '1200'),
    ]).filter((x) => x.date === '2026-09-01');
    expect(d[0]).toMatchObject({ dutyCode: 'LIS-OTHER', dutyType: 'Simulator' });
  });

  it('no longer falls back to the aircraft type as the duty code', () => {
    expect(duties.some((d) => d.dutyCode === 'E90' || d.dutyType === 'Other')).toBe(false);
  });
});
