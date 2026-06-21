import { describe, expect, it } from 'vitest';
import { interpretPgaGrid } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

// Regression for long date ranges (e.g. download from 01Jan to now). The old parser
// walked only 70 days from the period start, so any duty past ~10 weeks was dropped
// even though the PDF was complete. Here a flight sits on 2026-05-01 — day ~120 of a
// 01Jan–31Jul period — and must still be parsed with the correct date.
const tk = (text: string, x: number, y: number): PositionedToken => ({ text, x, y, width: 10, height: 10, page: 1 });

// 2026-05-01 is a Friday (Jan 1 2026 is Thursday; +120 days → Friday), so the day
// columns Fri01..Mon04 map onto May 1–4.
const tokens: PositionedToken[] = [
  // Period header: "01Jan26 -" immediately followed by the end date.
  tk('01Jan26 -', 60, 800),
  tk('31Jul26', 140, 800),
  // Grid header row (day columns + right-margin "date" label).
  tk('Fri01', 100, 500),
  tk('Sat02', 130, 500),
  tk('Sun03', 160, 500),
  tk('Mon04', 190, 500),
  tk('date', 500, 500),
  // One flight stacked under the Fri01 column (sub-column at x≈100).
  tk('TP', 100, 480),
  tk('100', 100, 470),
  tk('LIS', 100, 460),
  tk('OPO', 100, 450),
  tk('0800', 100, 440),
  tk('0845', 100, 430),
  tk('E95', 100, 420),
];

describe('interpretPgaGrid — long range (>70 days)', () => {
  const duties = interpretPgaGrid(tokens);

  it('parses a flight on day ~120 of the period', () => {
    const may1 = duties.filter((d) => d.date === '2026-05-01');
    expect(may1.length).toBeGreaterThan(0);
    expect(may1.find((d) => d.flightNumber === 'TP100')).toMatchObject({
      departureAirport: 'LIS',
      arrivalAirport: 'OPO',
      departureTime: '08:00',
      arrivalTime: '08:45',
    });
  });
});
