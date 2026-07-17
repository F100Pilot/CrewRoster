import { describe, it, expect } from 'vitest';
import { interpretPgaGrid } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

const tok = (text: string, x: number, y: number, page = 1): PositionedToken => ({
  text, x, y, width: 6, height: 6, page,
});

// Regression: a day stacks its legs right→left (the header sits over the first leg; later legs
// are sub-columns to its LEFT). For the LEFTMOST column of a band, those extra legs grow OUT past
// the header, so a fixed +/-9 left margin clipped the last leg. Real case: 30 Jul had
// LIS-OPO, OPO-LIS and a LIS-SVQ positioning leg, and the LIS-SVQ (leftmost sub-column) was
// dropped after a roster update. The band's left bound must widen to cover a multi-leg leftmost day.
describe('pgaGrid — leftmost band day keeps all its legs', () => {
  // A three-leg leftmost day (Thu30, header @89) with the third leg's sub-column at x=78,
  // past the old cols[0].x - 9 = 80 bound; plus a normal Wed29 to its right.
  const leg = (x: number, num: string, dep: string, arr: string, t1: string, t2: string): PositionedToken[] => [
    tok('TP', x, 769), tok(num, x, 754),
    tok(dep, x, 707), tok(t1, x, 685), tok(t2, x, 665), tok(arr, x, 643), tok('E90', x, 624),
  ];

  const tokens: PositionedToken[] = [
    tok('01Jul26 -', 562, 745), // calendar anchor → Thu30 = 30 Jul
    tok('date', 496, 811),
    tok('Thu30', 89, 811), tok('Wed29', 123, 811),
    ...leg(89, '1924', 'LIS', 'OPO', '0800', '0910'), // first leg (under the header)
    ...leg(84, '1925', 'OPO', 'LIS', '1000', '1100'), // second leg (left of header)
    ...leg(78, '1104', 'LIS', 'SVQ', '1200', '1300'), // third leg — was clipped
    ...leg(123, '1691', 'LIS', 'FNC', '1545', '1735'), // Wed29, a normal day to the right
  ];

  const flightsOn = (d: string) => interpretPgaGrid(tokens).filter((x) => x.date === d).map((x) => x.flightNumber);

  it('keeps all three legs of the leftmost day, including the LIS-SVQ positioning leg', () => {
    expect(flightsOn('2026-07-30')).toEqual(['TP1924', 'TP1925', 'TP1104']);
  });

  it('does not mis-file the leftmost day legs onto the neighbour day', () => {
    expect(flightsOn('2026-07-29')).toEqual(['TP1691']);
  });
});
