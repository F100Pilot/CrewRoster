import { describe, it, expect } from 'vitest';
import { interpretPgaGrid } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

const tok = (text: string, x: number, y: number, page = 1): PositionedToken => ({
  text, x, y, width: 6, height: 6, page,
});

// The roster's right-hand "Individual duty plan" gives each day's start/end times independently
// of the grid. interpretPgaGrid cross-checks the two and flags a day (duty.dayWarning) when the
// parsed flights end before the plan says the day ends — the signature of a dropped leg.
describe('pgaGrid — duty-plan cross-check flags a short-parsed day', () => {
  const grid = (num2: string, arr2: string, t2b: string): PositionedToken[] => [
    tok('01Jul26 -', 562, 745), // calendar anchor → Thu30 = 30 Jul
    tok('date', 496, 811), tok('Thu30', 89, 811),
    // Two flight legs actually parsed for the day: LIS-OPO 08:00-09:10, then a second leg.
    tok('TP', 89, 769), tok('1924', 89, 754), tok('LIS', 89, 707), tok('0800', 89, 685), tok('0910', 89, 665), tok('OPO', 89, 643), tok('E90', 89, 624),
    tok('TP', 84, 769), tok(num2, 84, 754), tok('OPO', 84, 707), tok('1000', 84, 685), tok(t2b, 84, 665), tok(arr2, 84, 643), tok('E90', 84, 624),
  ];

  // Right-side plan row for Thu30: start 08:00, end HHMM (independent of the grid).
  const plan = (endHHMM: string): PositionedToken[] => [
    tok('Thu30', 533, 470), tok('0800', 515, 468), tok(endHHMM, 509, 468), tok('FlD', 522, 468),
  ];

  it('flags the day when the plan ends later than the last parsed arrival', () => {
    // Grid ends 11:00 but the plan says the day ends 13:00 → a leg is missing.
    const duties = interpretPgaGrid([...grid('1925', 'LIS', '1100'), ...plan('1300')]);
    const jul30 = duties.filter((d) => d.date === '2026-07-30');
    expect(jul30.map((d) => d.flightNumber)).toEqual(['TP1924', 'TP1925']);
    expect(jul30[0].dayWarning).toMatch(/Possível voo em falta/);
    expect(jul30[0].dayWarning).toContain('13:00');
  });

  it('does not flag when the plan end matches the last parsed arrival', () => {
    const duties = interpretPgaGrid([...grid('1925', 'LIS', '1100'), ...plan('1100')]);
    const jul30 = duties.filter((d) => d.date === '2026-07-30');
    expect(jul30.every((d) => !d.dayWarning)).toBe(true);
  });
});
