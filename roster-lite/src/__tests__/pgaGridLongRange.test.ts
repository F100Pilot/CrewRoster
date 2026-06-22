import { describe, expect, it } from 'vitest';
import { addDays, format } from 'date-fns';
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

// A July week (Mon06..Sun12) shares its weekday+dd pattern with an April week, so a
// naive "earliest match" placed July duties in April. A real roster is CONTIGUOUS, and
// the parser tiles bands by date contiguity from the period start, so the July week
// lands in July. This builds a full contiguous 01Jan→late-Jul roster of weekly bands
// (one flight on 22 Jun and one on 06 Jul) to exercise that.
function contiguousRoster(): PositionedToken[] {
  const start = new Date(2026, 0, 1); // 01 Jan 2026
  const weeks = 28;
  const flights: Record<string, string> = { '2026-06-22': 'TP200', '2026-07-06': 'TP300' };
  const toks: PositionedToken[] = [tk('01Jan26 -', 60, 100000)];
  let y = 90000;
  for (let w = 0; w < weeks; w++) {
    const headerY = y;
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, w * 7 + i);
      toks.push(tk(format(d, 'EEEdd'), 100 + i * 30, headerY));
    }
    toks.push(tk('date', 500, headerY));
    for (let i = 0; i < 7; i++) {
      const iso = format(addDays(start, w * 7 + i), 'yyyy-MM-dd');
      const fn = flights[iso];
      if (!fn) continue;
      const fx = 100 + i * 30;
      const fy = headerY - 50;
      toks.push(tk('TP', fx, fy), tk(fn.slice(2), fx, fy - 10), tk('LIS', fx, fy - 20),
        tk('OPO', fx, fy - 30), tk('0900', fx, fy - 40), tk('0945', fx, fy - 50), tk('E95', fx, fy - 55));
    }
    y -= 100;
  }
  return toks;
}

describe('interpretPgaGrid — recurring weekly band collision (contiguous)', () => {
  const duties = interpretPgaGrid(contiguousRoster());

  it('places the July week in July, not the colliding April week', () => {
    expect(duties.find((d) => d.flightNumber === 'TP300')?.date).toBe('2026-07-06');
    expect(duties.some((d) => d.date === '2026-04-06')).toBe(false);
  });

  it('places the June flight correctly', () => {
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

// A standalone "DH" token above the carrier code marks the sector as deadhead crew
// (positioning as a passenger), distinct from the "DH/TP" combined prefix.
const deadhead: PositionedToken[] = [
  tk('01Jul26 -', 60, 900),
  tk('Wed01', 100, 600), tk('Thu02', 130, 600), tk('Fri03', 160, 600), tk('Sat04', 190, 600),
  tk('Sun05', 220, 600), tk('Mon06', 250, 600), tk('Tue07', 280, 600), tk('date', 500, 600),
  // DH above TP -> deadhead flight TP950 LIS-OPO on Wed 01 Jul.
  tk('DH', 100, 565), tk('TP', 100, 555), tk('950', 100, 545), tk('LIS', 100, 535),
  tk('OPO', 100, 525), tk('0700', 100, 515), tk('0745', 100, 505), tk('E95', 100, 500),
];

describe('interpretPgaGrid — standalone DH deadhead', () => {
  const duties = interpretPgaGrid(deadhead);
  it('marks a flight preceded by a DH token as positioning/deadhead', () => {
    const f = duties.find((d) => d.flightNumber === 'TP950');
    expect(f).toMatchObject({ dutyCode: 'DH', dutyType: 'Positioning', departureAirport: 'LIS', arrivalAirport: 'OPO' });
  });
});

// DH/AY = deadhead on another airline (AY = Finnair). The carrier matcher must accept
// "DH/" + any airline, not only DH/TP|LH|NI|S4.
const dhOther: PositionedToken[] = [
  tk('01Jul26 -', 60, 900),
  tk('Wed01', 100, 600), tk('Thu02', 130, 600), tk('Fri03', 160, 600), tk('Sat04', 190, 600),
  tk('Sun05', 220, 600), tk('Mon06', 250, 600), tk('Tue07', 280, 600), tk('date', 500, 600),
  tk('DH/AY', 100, 560), tk('1740', 100, 550), tk('LIS', 100, 540), tk('1610', 100, 530),
  tk('2050', 100, 520), tk('HEL', 100, 510),
];

describe('interpretPgaGrid — deadhead on another airline', () => {
  const duties = interpretPgaGrid(dhOther);
  it('parses DH/AY as a positioning sector LIS-HEL', () => {
    expect(duties.find((d) => d.dutyType === 'Positioning')).toMatchObject({
      dutyCode: 'DH', departureAirport: 'LIS', arrivalAirport: 'HEL', flightNumber: 'AY1740',
    });
  });
});

// An unrecognised code (e.g. FAL) must still produce a duty so the day is not dropped.
const unknownCode: PositionedToken[] = [
  tk('01Jul26 -', 60, 900),
  tk('Wed01', 100, 600), tk('Thu02', 130, 600), tk('Fri03', 160, 600), tk('Sat04', 190, 600),
  tk('Sun05', 220, 600), tk('Mon06', 250, 600), tk('Tue07', 280, 600), tk('date', 500, 600),
  tk('FAL', 100, 560), tk('LIS', 100, 550),
];

describe('interpretPgaGrid — unknown code safety net', () => {
  const duties = interpretPgaGrid(unknownCode);
  it('keeps the day with a generic Other duty showing the code', () => {
    const d = duties.find((x) => x.date === '2026-07-01');
    expect(d).toMatchObject({ dutyCode: 'FAL', dutyType: 'Other' });
  });
});
