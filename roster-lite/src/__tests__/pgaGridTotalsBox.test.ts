import { describe, it, expect } from 'vitest';
import { interpretPgaGrid } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

const tok = (text: string, x: number, y: number, page = 1): PositionedToken => ({
  text, x, y, width: 6, height: 6, page,
});

// Regression: the period's totals box ("Flight time", "Vacation", "Off days", "Duty time"…) is
// drawn transposed just LEFT of the last day of the period. That is inside the reach the band
// opens for a multi-leg leftmost day, so its labels were read as that day's content. With the
// label split into words, "Off" alone classified as a day off: 31 Oct, a vacation day (RLIC),
// showed as "OFF + RLIC". Layout modelled on a real October 2026 roster; text only, synthetic.
describe('pgaGrid — the totals box beside the last day is not read as a duty', () => {
  const totalsBox = (offDays: string[]): PositionedToken[] => [
    tok('Sum', 262, 790), tok('0:00', 262, 700),
    tok('Fict.', 274, 790), tok('flight time', 274, 765), tok('0:00', 274, 700),
    tok('Sum', 280, 790), tok('(net)', 280, 775), tok('0:00', 280, 700),
    tok('Sickness', 292, 790), tok('0:00', 292, 700), tok('Alt.', 292, 675), tok('flight duty', 292, 655),
    tok('Vacation', 298, 790), tok('0:00', 298, 700), ...offDays.map((w, i) => tok(w, 298, 675 - i * 8)),
    tok('Flight', 304, 790), tok('time', 304, 765), tok('0:00', 304, 700), tok('Duty time', 304, 675),
  ];

  const roster = (offDays: string[]): PositionedToken[] => [
    tok('01Oct26 -', 562, 745), // calendar anchor → Sat31 = 31 Oct 2026
    tok('date', 496, 811),
    tok('Sat31', 332, 811), tok('Fri30', 366, 811),
    ...totalsBox(offDays),
    tok('RLIC', 332, 770), tok('LIS', 332, 710), // 31 Oct: vacation only
    // 30 Oct: a flight whose cell ends with an upper-case crew surname that happens to read
    // like a totals label — case decides, so it must stay part of the day.
    tok('TP', 366, 769), tok('1336', 366, 754), tok('LIS', 366, 707), tok('0700', 366, 685),
    tok('0830', 366, 665), tok('OPO', 366, 643), tok('E90', 366, 624), tok('SUM', 366, 610),
  ];

  const on = (tokens: PositionedToken[], date: string) =>
    interpretPgaGrid(tokens).filter((d) => d.date === date).map((d) => d.dutyCode);

  it('keeps 31 Oct as RLIC only when the PDF splits "Off days" into words', () => {
    expect(on(roster(['Off', 'days']), '2026-10-31')).toEqual(['RLIC']);
  });

  it('keeps 31 Oct as RLIC only when "Off days" comes as one token', () => {
    expect(on(roster(['Off days']), '2026-10-31')).toEqual(['RLIC']);
  });

  it('leaves the neighbouring day intact, upper-case crew surname included', () => {
    const fri = interpretPgaGrid(roster(['Off', 'days'])).filter((d) => d.date === '2026-10-30');
    expect(fri.map((d) => d.flightNumber)).toEqual(['TP1336']);
    expect(fri[0]).toMatchObject({ departureAirport: 'LIS', arrivalAirport: 'OPO', departureTime: '07:00', arrivalTime: '08:30' });
  });
});
