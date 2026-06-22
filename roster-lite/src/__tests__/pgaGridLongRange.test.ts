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
  // Period header anchored on the start. A misleading early date sits right after it
  // (the kind of token that used to truncate the calendar to ~February); it must be
  // ignored so May still parses.
  tk('01Jan26 -', 60, 800),
  tk('28Feb26', 140, 800),
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

// A July week (Mon06..Sun12) has the same weekday+dd pattern as an April week, so a
// naive "earliest match" placed July duties in April — leaving July past day 1 empty.
// Processing bands in document order with a chronological cursor fixes it.
const collide: PositionedToken[] = [
  tk('01Jan26 -', 60, 900),
  // Band A (read first): week of Mon 22 Jun — unique, advances the cursor into late June.
  tk('Mon22', 100, 600), tk('Tue23', 130, 600), tk('Wed24', 160, 600), tk('Thu25', 190, 600),
  tk('Fri26', 220, 600), tk('Sat27', 250, 600), tk('Sun28', 280, 600), tk('date', 500, 600),
  tk('TP', 100, 560), tk('200', 100, 550), tk('LIS', 100, 540), tk('OPO', 100, 530),
  tk('0900', 100, 520), tk('0945', 100, 510), tk('E95', 100, 505),
  // Band B (read second): week of Mon 06 Jul — collides with Mon 06 Apr.
  tk('Mon06', 100, 300), tk('Tue07', 130, 300), tk('Wed08', 160, 300), tk('Thu09', 190, 300),
  tk('Fri10', 220, 300), tk('Sat11', 250, 300), tk('Sun12', 280, 300), tk('date', 500, 300),
  tk('TP', 100, 260), tk('300', 100, 250), tk('LIS', 100, 240), tk('FAO', 100, 230),
  tk('1000', 100, 220), tk('1050', 100, 210), tk('E90', 100, 205),
];

describe('interpretPgaGrid — recurring weekly band collision', () => {
  const duties = interpretPgaGrid(collide);

  it('places the July week in July, not the colliding April week', () => {
    const tp300 = duties.find((d) => d.flightNumber === 'TP300');
    expect(tp300?.date).toBe('2026-07-06');
    expect(duties.some((d) => d.date === '2026-04-06')).toBe(false);
  });

  it('still places the preceding June week correctly', () => {
    expect(duties.find((d) => d.flightNumber === 'TP200')?.date).toBe('2026-06-22');
  });
});

// The PGA grid packs a variable number of days per row; the final row is the
// remainder and can be short (1–3 days). A ">=4 columns" header rule dropped it, so
// the period appeared to stop a couple of days early (e.g. July ending on the 29th).
const trailing: PositionedToken[] = [
  tk('01Jul26 -', 60, 900),
  // Normal band: Wed 01 – Tue 07 Jul.
  tk('Wed01', 100, 600), tk('Thu02', 130, 600), tk('Fri03', 160, 600), tk('Sat04', 190, 600),
  tk('Sun05', 220, 600), tk('Mon06', 250, 600), tk('Tue07', 280, 600), tk('date', 500, 600),
  tk('TP', 100, 560), tk('400', 100, 550), tk('LIS', 100, 540), tk('OPO', 100, 530),
  tk('0700', 100, 520), tk('0745', 100, 510), tk('E95', 100, 505),
  // Short trailing band: Thu 30 – Fri 31 Jul (only 2 day columns).
  tk('Thu30', 100, 300), tk('Fri31', 130, 300), tk('date', 500, 300),
  tk('TP', 100, 260), tk('500', 100, 250), tk('LIS', 100, 240), tk('FNC', 100, 230),
  tk('2000', 100, 220), tk('2130', 100, 210), tk('E90', 100, 205),
];

describe('interpretPgaGrid — short trailing band', () => {
  const duties = interpretPgaGrid(trailing);

  it('parses the last 2-day band (30–31 Jul) that a >=4-column rule dropped', () => {
    // The flight sits under the Thu30 column (x=100), so it lands on 30 Jul; the key
    // point is the short trailing band is no longer dropped.
    expect(duties.find((d) => d.flightNumber === 'TP500')?.date).toBe('2026-07-30');
  });
});
