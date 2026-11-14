import { describe, expect, it } from 'vitest';
import { autoPrevenir, canCompareIO, isPrevenirIO } from '../irregularity';
import { mergeDuties } from '../rosterMerge';
import { dutyDays, PGA_PILOT_RULES } from '../dutyTime';
import { DEFAULT_PAY_SETTINGS, payEstimate } from '../payEstimate';
import type { ParsedDuty } from '../types';
import tokensJson from '../../__tests__/fixtures/pga-tokens.json';
import { interpretPgaGrid, pgaDutyTimes } from '../../parsing/pdf/pgaGrid';

// IO (irregularidade operacional) and the "prevenir" — a colleague's report (Nov 2026): called at
// the report for the alcohol test, the planned flight isn't flown; the roster shows IO from the
// report with the same duty. The day counts in full. Synthetic flight numbers.
const d = (x: Partial<ParsedDuty>): ParsedDuty => ({
  date: '2026-11-01', dutyCode: 'FLT', dutyType: 'Flight Duty', reportingTime: null, departureTime: null,
  arrivalTime: null, flightNumber: null, departureAirport: null, arrivalAirport: null, aircraftType: 'E90',
  observations: null, ...x,
});
// The planned day, as the earlier download printed it: report 10:15, back 16:10, [DT] 6h25.
const DT = 6 * 60 + 25;
const planned = [
  d({ flightNumber: 'TP9101', departureAirport: 'LIS', arrivalAirport: 'RAK', departureTime: '11:15', arrivalTime: '12:55', reportingTime: '10:15', rosterDt: DT }),
  d({ flightNumber: 'TP9102', departureAirport: 'RAK', arrivalAirport: 'LIS', departureTime: '13:45', arrivalTime: '16:10', rosterDt: DT }),
];
const io = (start = '10:15', end = '16:40', rosterDt: number | undefined = DT) =>
  d({ dutyType: 'Other', dutyCode: 'IO', departureAirport: 'LIS', reportingTime: start, departureTime: start, arrivalTime: end, rosterDt });

describe('IO / prevenir', () => {
  it('the prevenir: the IO has exactly the planned duty ([DT] before = [DT] after) — the user\'s rule', () => {
    const [merged] = mergeDuties(planned, [io()], '2026-11-01');
    expect(merged.planned?.reportingTime).toBe('10:15');
    expect(merged.planned?.dutyMinutes).toBe(DT);
    expect(isPrevenirIO(merged)).toBe(true);
  });

  it('a different duty is an IO normal (Manchester: flights, then the IO) — and the roster decides, not a mark', () => {
    const [merged] = mergeDuties(planned, [io('11:20', '16:40', 5 * 60 + 20)], '2026-11-02');
    expect(autoPrevenir(merged)).toBe(false);
    expect(isPrevenirIO(merged)).toBe(false);
    expect(isPrevenirIO({ ...merged, prevenir: true })).toBe(false);
    expect(isPrevenirIO({ ...mergeDuties(planned, [io()])[0], prevenir: false })).toBe(true);
  });

  it('the same window but one minute more of duty is not the same duty', () => {
    expect(isPrevenirIO(mergeDuties(planned, [io('10:15', '16:41', DT + 1)], '2026-11-01')[0])).toBe(false);
  });

  it('without a printed [DT] (older stored days): the IO must cover the planned duty, report to arrival + 30 min', () => {
    const noDt = planned.map(({ rosterDt: _, ...x }) => x as ParsedDuty);
    // The app's report is the departure − 1 h; the real one a few minutes off.
    expect(isPrevenirIO(mergeDuties(noDt, [io('10:12', '16:40', undefined)], '2026-11-01')[0])).toBe(true);
    expect(isPrevenirIO(mergeDuties(noDt, [io('11:20', '16:40', undefined)], '2026-11-01')[0])).toBe(false);
    expect(isPrevenirIO(mergeDuties(noDt, [io('10:15', '18:30', undefined)], '2026-11-01')[0])).toBe(false);
  });

  it('a later download showing the same IO keeps the plan', () => {
    const first = mergeDuties(planned, [io()], '2026-11-01');
    const again = mergeDuties(first, [io()], '2026-11-05');
    expect(again[0].planned?.dutyMinutes).toBe(DT);
    expect(isPrevenirIO(again[0])).toBe(true);
  });

  it('without an earlier download there is nothing to compare: the crew member says it', () => {
    const [only] = mergeDuties([], [io()], '2026-11-01');
    expect(canCompareIO(only)).toBe(false);
    expect(isPrevenirIO(only)).toBe(false);
    expect(isPrevenirIO({ ...only, prevenir: true })).toBe(true);
  });

  it('the IO counts as duty for its whole period (10:15–16:40 = 6h25)', () => {
    const [day] = dutyDays([io()], PGA_PILOT_RULES);
    expect(day.minutes).toBe(6 * 60 + 25);
  });

  it('an IO normal after the flights extends the duty to its end (MAN case: 05:12–15:08)', () => {
    const day = [
      d({ date: '2026-04-08', flightNumber: 'TP9310', departureAirport: 'LIS', arrivalAirport: 'MAN', departureTime: '06:12', arrivalTime: '08:52', reportingTime: '05:12' }),
      d({ date: '2026-04-08', flightNumber: 'TP9311', departureAirport: 'MAN', arrivalAirport: 'MAN', departureTime: '09:58', arrivalTime: '10:47' }),
      d({ date: '2026-04-08', dutyType: 'Other', dutyCode: 'IO', departureAirport: 'MAN', reportingTime: '11:00', departureTime: '11:00', arrivalTime: '15:08' }),
    ];
    expect(dutyDays(day, PGA_PILOT_RULES)[0].minutes).toBe(9 * 60 + 56);
  });

  it('the prevenir pays per diem A, national (at base: no exempt part)', () => {
    const prevenir = { ...io(), prevenir: true };
    const r = payEstimate([prevenir], '2026-11', DEFAULT_PAY_SETTINGS, '2026-11-30');
    expect(r.perDiemA).toBe(1);
    expect(r.perDiemTravelDays).toBe(0);
    expect(payEstimate([io()], '2026-11', DEFAULT_PAY_SETTINGS, '2026-11-30').perDiemA).toBe(0);
  });

  it('the grid parser reads an IO where the roster prints a ground duty (code, airport, two times)', () => {
    // The anonymised fixture's GAB1/GAB2 day (25/06) with its codes turned into IO — the real layout.
    const tokens = JSON.parse(JSON.stringify((tokensJson as { tokens?: unknown }).tokens ?? tokensJson));
    for (const t of tokens) if (t.page === 1 && Math.abs(t.y - 769) < 1 && [222, 227].includes(Math.round(t.x))) t.text = 'IO';
    const io = interpretPgaGrid(tokens).filter((x) => x.dutyCode === 'IO');
    expect(io.map((x) => [x.date, x.dutyType, x.departureAirport, x.departureTime, x.arrivalTime])).toEqual([
      ['2026-06-25', 'Other', 'LIS', '08:30', '12:00'],
      ['2026-06-25', 'Other', 'LIS', '13:00', '16:30'],
    ]);
  });

  it('reads each day\'s printed duty time ([DT]) from the grid', () => {
    const dt = pgaDutyTimes(((tokensJson as { tokens?: unknown }).tokens ?? tokensJson) as Parameters<typeof pgaDutyTimes>[0]);
    expect(dt.get('2026-06-25')).toBe(8 * 60); // GAB1 08:30–12:00 + GAB2 13:00–16:30, DT 08:00
    expect(dt.get('2026-07-15')).toBe(11 * 60 + 30);
  });
});
