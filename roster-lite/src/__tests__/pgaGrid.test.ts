import { describe, expect, it } from 'vitest';
import tokens from './fixtures/pga-tokens.json';
import { interpretPgaGrid } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

// Real tokens captured from a Portugália NetLine "Individual duty plan" PDF
// (period 15Jun26–31Jul26), reduced to position-only data.
const duties = interpretPgaGrid(tokens as PositionedToken[]);
const onDate = (date: string) => duties.filter((d) => d.date === date);

describe('interpretPgaGrid (real PGA PDF fixture)', () => {
  it('reconstructs full dates across the whole period (15Jun–31Jul)', () => {
    const dates = [...new Set(duties.map((d) => d.date))].sort();
    expect(dates[0]).toBe('2026-06-15');
    expect(dates[dates.length - 1]).toBe('2026-07-31');
    expect(dates.length).toBeGreaterThanOrEqual(45);
  });

  it('parses the Sat 20 Jun flight TP868 LIS-BLQ with times and aircraft', () => {
    const flight = onDate('2026-06-20').find((d) => d.flightNumber === 'TP868');
    expect(flight).toMatchObject({
      dutyType: 'Flight Duty',
      departureAirport: 'LIS',
      arrivalAirport: 'BLQ',
      departureTime: '06:15',
      arrivalTime: '09:10',
      aircraftType: expect.stringMatching(/E95/i),
    });
  });

  it('parses the Sun 21 Jun flight TP874 LIS-FLR', () => {
    const flight = onDate('2026-06-21').find((d) => d.flightNumber === 'TP874');
    expect(flight).toMatchObject({ departureAirport: 'LIS', arrivalAirport: 'FLR', departureTime: '06:05' });
  });

  it('detects the Thu 2 Jul deadhead (positioning) to FRA', () => {
    const dh = onDate('2026-07-02').find((d) => d.dutyType === 'Positioning');
    expect(dh).toBeTruthy();
    expect(dh?.arrivalAirport).toBe('FRA');
  });

  it('marks W_OFF days as Day Off', () => {
    expect(onDate('2026-06-16').some((d) => d.dutyType === 'Day Off')).toBe(true);
  });

  it('recognises simulator days', () => {
    expect(onDate('2026-06-15').some((d) => d.dutyType === 'Simulator')).toBe(true);
  });
});
