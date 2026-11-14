import { describe, expect, it } from 'vitest';
import tokens from './fixtures/pga-tokens.json';
import { interpretPgaGrid } from '../parsing/pdf/pgaGrid';
import type { PositionedToken } from '../parsing/pdf/extractText';

// Real tokens captured from a Portugália NetLine "Individual duty plan" PDF
// (period 19Jun26–31Jul26), reduced to position-only data and anonymised.
const duties = interpretPgaGrid(tokens as PositionedToken[]);
const onDate = (date: string) => duties.filter((d) => d.date === date);

describe('interpretPgaGrid (real PGA PDF fixture)', () => {
  it('reconstructs full dates across the whole period (19Jun–31Jul)', () => {
    const dates = [...new Set(duties.map((d) => d.date))].sort();
    expect(dates[0]).toBe('2026-06-19');
    expect(dates[dates.length - 1]).toBe('2026-07-31');
    expect(dates.length).toBeGreaterThanOrEqual(40);
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

  // Fri 26 Jun used to collapse to a single "FLT": its three flights live in
  // sub-columns only ~25px apart, so the old nearest-label assignment dropped two.
  it('keeps all three flights on Fri 26 Jun (LIS-RAK-LIS-NCE)', () => {
    const flights = onDate('2026-06-26').filter((d) => d.dutyType === 'Flight Duty');
    expect(flights).toHaveLength(3);
    expect(flights.map((f) => f.flightNumber)).toEqual(['TP1454', 'TP1455', 'TP484']);
    expect(flights[0]).toMatchObject({ departureAirport: 'LIS', arrivalAirport: 'RAK', departureTime: '13:50', arrivalTime: '15:30' });
    expect(flights[2]).toMatchObject({ departureAirport: 'LIS', arrivalAirport: 'NCE', departureTime: '19:35', arrivalTime: '22:05' });
  });

  // Sat 27 Jun is an "X" — a day off away from base — and must read as X, not OFF.
  it('marks Sat 27 Jun as an X day off (away from base)', () => {
    const day = onDate('2026-06-27');
    expect(day).toHaveLength(1);
    expect(day[0]).toMatchObject({ dutyCode: 'X', dutyType: 'Day Off' });
  });

  // Sun 28 Jun is a flight plus an FPE-LEARN training slot with its own time window.
  it('parses Sun 28 Jun: TP485 flight + FPE-LEARN training 07:45-08:15', () => {
    const day = onDate('2026-06-28');
    const flight = day.find((d) => d.dutyType === 'Flight Duty');
    expect(flight).toMatchObject({ flightNumber: 'TP485', departureAirport: 'NCE', arrivalAirport: 'LIS' });
    const training = day.find((d) => d.dutyType === 'Training');
    expect(training).toMatchObject({
      dutyCode: 'FPE-LEARN',
      departureTime: '07:45',
      arrivalTime: '08:15',
    });
  });

  it('keeps all three flights on tightly-spaced columns (Sun 19 Jul TP1134/1135/1136)', () => {
    const flights = onDate('2026-07-19').filter((d) => d.dutyType === 'Flight Duty');
    expect(flights.map((f) => f.flightNumber)).toEqual(['TP1134', 'TP1135', 'TP1136']);
  });

  // Page 3 is a qualifications/licences sheet (with "VAC" = vaccine, "LPC", "IM"…).
  // It must not leak into the roster: Thu 16 Jul is office duty, not vacation.
  it('does not treat the licences page as duties (no spurious vacation)', () => {
    expect(duties.some((d) => d.dutyType === 'Vacation')).toBe(false);
    expect(onDate('2026-07-16').map((d) => d.dutyCode).sort()).toEqual(['GAB1', 'GAB2']);
  });

  // Page 2 stacks the real Jul 27–31 grid on top of per-flight summary tables that
  // re-list June/July flights in non-chronological columns. The summary band must not
  // leak upward into the last roster grid: Mon 27 Jul is only TP1691/TP1692, never the
  // June TP874 (Sun 21 Jun) or TP1454 (Fri 26 Jun) that live in the summary below.
  it('does not leak summary-table flights into the last grid (Mon 27 Jul)', () => {
    const day = onDate('2026-07-27').filter((d) => d.dutyType === 'Flight Duty');
    expect(day.map((d) => d.flightNumber)).toEqual(['TP1691', 'TP1692']);
    expect(duties.some((d) => d.date === '2026-07-27' && d.flightNumber === 'TP874')).toBe(false);
  });

  it('detects the Thu 2 Jul deadhead (positioning) to FRA', () => {
    const dh = onDate('2026-07-02').find((d) => d.dutyType === 'Positioning');
    expect(dh).toBeTruthy();
    expect(dh?.arrivalAirport).toBe('FRA');
  });

  it('marks W_OFF days as Day Off', () => {
    expect(onDate('2026-06-22').some((d) => d.dutyType === 'Day Off')).toBe(true);
  });

  it('recognises simulator days', () => {
    expect(duties.some((d) => d.dutyType === 'Simulator')).toBe(true);
  });
});

describe('interpretPgaGrid — line check marks (W_INS)', () => {
  it('attaches W_INS to its flights the same way as LIFUS_INS (the examiner on a line check)', () => {
    const swapped = (tokens as PositionedToken[]).map((t) => (t.text.trim() === 'LIFUS_INS' ? { ...t, text: 'W_INS' } : t));
    const marked = (list: typeof duties, mark: string) =>
      list.filter((d) => (d.observations ?? '').split(/,\s*/).includes(mark)).map((d) => `${d.date} ${d.flightNumber}`);
    const lifus = marked(duties, 'LIFUS_INS');
    expect(lifus.length).toBeGreaterThan(0);
    expect(marked(interpretPgaGrid(swapped), 'W_INS')).toEqual(lifus);
  });
});

describe('interpretPgaGrid — line training given (CLTC / CTRI)', () => {
  it('reads "LOGIN CLTC" after the aircraft: the mark goes to the notes, the login is the trainee', () => {
    // The token printed after TP868's aircraft, swapped for a synthetic line-training mark.
    const withMark = (tokens as PositionedToken[]).map((t) =>
      t.page === 1 && t.x === 434 && t.y === 596 ? { ...t, text: 'QTRAIN CLTC' } : t);
    const tp868 = interpretPgaGrid(withMark).find((d) => d.date === '2026-06-20' && d.flightNumber === 'TP868');
    expect(tp868!.observations!.split(', ')).toContain('CLTC');
    expect(tp868!.trainee).toBe('QTRAIN');
    expect(onDate('2026-06-20').find((d) => d.flightNumber === 'TP868')!.trainee).toBeUndefined();
  });
});

describe('interpretPgaGrid — W_PNC_ST (cabin line check)', () => {
  it('marks every flight of the day, and nothing else', () => {
    const withMark = (tokens as PositionedToken[]).map((t) =>
      t.page === 1 && t.x === 434 && t.y === 596 ? { ...t, text: 'W_PNC_ST' } : t);
    const parsed = interpretPgaGrid(withMark);
    const flights = parsed.filter((d) => d.date === '2026-06-20' && d.dutyType === 'Flight Duty');
    expect(flights.length).toBeGreaterThan(0);
    for (const f of flights) expect(f.observations!.split(', ')).toContain('W_PNC_ST');
    expect(parsed.filter((d) => d.date !== '2026-06-20' && (d.observations ?? '').includes('W_PNC_ST'))).toEqual([]);
  });
});

describe('pgaBlankDates', () => {
  it('finds no blank day in a fully printed roster', async () => {
    const { pgaBlankDates } = await import('../parsing/pdf/pgaGrid');
    expect(pgaBlankDates(tokens as PositionedToken[])).toEqual([]);
  });
});
