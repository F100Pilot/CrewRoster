import { describe, expect, it } from 'vitest';
import {
  AE_DUTY_LIMITS, DUTY_LIMITS, HOME_STANDBY_FACTOR, PGA_PILOT_RULES, aeDutyTime, dutyDays, peakDutyTime,
  peakDutyWindow,
} from '../domain/dutyTime';
import type { ParsedDuty } from '../domain/types';

// Minimal duty builder — only the fields the duty-time maths reads.
function duty(p: Partial<ParsedDuty> & { date: string; dutyType: string }): ParsedDuty {
  return {
    dutyCode: 'X', flightNumber: null, departureAirport: null, arrivalAirport: null,
    departureTime: null, arrivalTime: null, reportingTime: null, aircraftType: null,
    observations: null, ...p,
  } as ParsedDuty;
}

// A flight day: report 05:30, blocks 06:00 → 11:00. Duty = report → last arrival.
function flightDay(date: string, report = '05:30', off = '06:00', on = '11:00'): ParsedDuty {
  return duty({
    date, dutyType: 'Flight Duty', dutyCode: 'FLT', flightNumber: 'TP1',
    departureAirport: 'LIS', arrivalAirport: 'OPO',
    reportingTime: report, departureTime: off, arrivalTime: on,
  });
}

describe('dutyDays', () => {
  it('measures a day from the report time to the last arrival', () => {
    const [d] = dutyDays([flightDay('2026-06-01')]);
    expect(d).toMatchObject({ date: '2026-06-01', minutes: 330, span: 330, partial: false });
  });

  it('spans the whole day when several sectors are rostered, turnarounds included', () => {
    const [d] = dutyDays([
      duty({ date: '2026-06-02', dutyType: 'Flight Duty', reportingTime: '05:30', departureTime: '06:00', arrivalTime: '08:00' }),
      duty({ date: '2026-06-02', dutyType: 'Flight Duty', departureTime: '09:00', arrivalTime: '11:00' }),
    ]);
    expect(d.minutes).toBe(330); // 05:30 → 11:00, not 2h + 2h of block
  });

  it('handles a duty that runs past midnight', () => {
    const [d] = dutyDays([
      duty({ date: '2026-06-03', dutyType: 'Flight Duty', reportingTime: '21:00', departureTime: '22:00', arrivalTime: '01:30' }),
    ]);
    expect(d.minutes).toBe(270); // 21:00 → 01:30 next day
  });

  it('ignores days off, vacation and absences', () => {
    expect(dutyDays([
      duty({ date: '2026-06-04', dutyType: 'Day Off' }),
      duty({ date: '2026-06-05', dutyType: 'Vacation' }),
      duty({ date: '2026-06-06', dutyType: 'Absence' }),
    ])).toEqual([]);
  });

  it('ignores a duty the parser could not time', () => {
    expect(dutyDays([duty({ date: '2026-06-07', dutyType: 'Office Duty' })])).toEqual([]);
  });

  it('counts a home-standby-only day at the reduced share', () => {
    const [d] = dutyDays([
      duty({ date: '2026-06-08', dutyType: 'Standby Home', dutyCode: 'A3', departureTime: '06:00', arrivalTime: '18:00' }),
    ]);
    expect(d.partial).toBe(true);
    expect(d.span).toBe(720);
    expect(d.minutes).toBe(720 * HOME_STANDBY_FACTOR);
  });

  it('counts a standby that turned into a flight at its share until the report, then the work in full', () => {
    const [d] = dutyDays([
      duty({ date: '2026-06-09', dutyType: 'Standby Home', departureTime: '06:00', arrivalTime: '10:00' }),
      duty({ date: '2026-06-09', dutyType: 'Flight Duty', departureTime: '11:00', arrivalTime: '15:00' }),
    ]);
    expect(d.partial).toBe(false);
    expect(d.minutes).toBe(240 + 240 * HOME_STANDBY_FACTOR); // flight 11–15 in full + standby 06–10 at 25%
  });

  it('does not count twice the part of a standby that overlaps the work', () => {
    const [d] = dutyDays([
      duty({ date: '2026-06-09', dutyType: 'Standby Home', departureTime: '06:00', arrivalTime: '16:00' }),
      duty({ date: '2026-06-09', dutyType: 'Flight Duty', departureTime: '11:00', arrivalTime: '15:00' }),
    ]);
    // 06–11 and 15–16 as standby (6h at 25%); 11–15 once, as work.
    expect(d.minutes).toBe(240 + 360 * HOME_STANDBY_FACTOR);
  });

  it('counts airport standby, simulator and training in full', () => {
    const days = dutyDays([
      duty({ date: '2026-06-10', dutyType: 'Standby Airport', departureTime: '06:00', arrivalTime: '10:00' }),
      duty({ date: '2026-06-11', dutyType: 'Simulator', departureTime: '08:00', arrivalTime: '12:00' }),
      duty({ date: '2026-06-12', dutyType: 'Training', departureTime: '09:00', arrivalTime: '12:00' }),
    ]);
    expect(days.map((d) => d.minutes)).toEqual([240, 240, 180]);
    expect(days.map((d) => d.partial)).toEqual([true, false, false]); // the standby-only day
  });
});

describe('peakDutyWindow', () => {
  it('finds the worst window rather than the trailing one', () => {
    // A heavy week in June, then a quiet one — the peak must stay on the heavy week.
    const heavy = ['2026-06-01', '2026-06-02', '2026-06-03'].map((d) => flightDay(d, '05:00', '06:00', '17:00'));
    const light = [flightDay('2026-06-20', '09:00', '10:00', '12:00')];
    const peak = peakDutyWindow(dutyDays([...heavy, ...light]), 7);
    expect(peak.minutes).toBe(3 * 720);
    expect(peak.endDate).toBe('2026-06-03');
  });

  it('is empty for a roster with no timed duty', () => {
    expect(peakDutyWindow(dutyDays([duty({ date: '2026-06-01', dutyType: 'Day Off' })]), 7))
      .toEqual({ minutes: 0, endDate: null });
  });

  it('counts a window inclusively — 7 days means the end day plus the 6 before it', () => {
    // Duty exactly 6 days apart is inside one 7-day window; 7 days apart is not.
    const inside = dutyDays([flightDay('2026-06-01'), flightDay('2026-06-07')]);
    expect(peakDutyWindow(inside, 7).minutes).toBe(660);
    const outside = dutyDays([flightDay('2026-06-01'), flightDay('2026-06-08')]);
    expect(peakDutyWindow(outside, 7).minutes).toBe(330);
  });
});

describe('peakDutyTime', () => {
  it('reports the three ORO.FTL.210 windows', () => {
    const duties = Array.from({ length: 20 }, (_, i) =>
      flightDay(`2026-06-${String(i + 1).padStart(2, '0')}`, '06:00', '07:00', '16:00'));
    const { days7, days14, days28 } = peakDutyTime(duties);
    expect(days7.minutes).toBe(7 * 600);
    expect(days14.minutes).toBe(14 * 600);
    expect(days28.minutes).toBe(20 * 600); // only 20 days exist
  });

  it('keeps the regulation figures', () => {
    expect(DUTY_LIMITS).toEqual({ days7: 3600, days14: 6600, days28: 11400 });
  });
});

// Company agreement (pilots): RUPT cl. 31 limits, cl. 19.7 / 20.4 standby shares, cl. 6 def. 42
// debriefing; standby windows from the DOV code notice of Feb 2025.
describe('dutyDays — company agreement (pilots)', () => {
  const pilot = (ds: ParsedDuty[]) => dutyDays(ds, PGA_PILOT_RULES);

  it('keeps the agreement figures', () => {
    expect(AE_DUTY_LIMITS).toEqual({ days7: 3000, days28: 10800, quarter: 28800, year: 108000 });
  });

  it('adds 30 min of debriefing after the last sector', () => {
    expect(pilot([flightDay('2026-06-01')])[0].minutes).toBe(330 + 30);
  });

  it('adds no debriefing when the day ends on a positioning leg', () => {
    const [d] = pilot([
      flightDay('2026-06-01', '05:30', '06:00', '08:00'),
      duty({ date: '2026-06-01', dutyType: 'Positioning', dutyCode: 'DH', departureTime: '09:00', arrivalTime: '10:30' }),
    ]);
    expect(d.minutes).toBe(300); // 05:30 → 10:30, dead-head ends at its arrival (cl. 17)
  });

  it('counts a pilot home standby from the DOV window, at 25%, even with only a start time', () => {
    // H7+ is 07:00–17:00 local: 10h. The grid gives at most the start, never the end.
    const [d] = pilot([duty({ date: '2026-06-02', dutyType: 'Standby Home', dutyCode: 'H7+', reportingTime: '06:00' })]);
    expect(d).toMatchObject({ span: 600, minutes: 150, partial: true });
  });

  it('counts the short early standby H509 as 4h', () => {
    const [d] = pilot([duty({ date: '2026-06-02', dutyType: 'Standby Home', dutyCode: 'H509' })]);
    expect(d.span).toBe(240);
  });

  it('counts airport standby at 50%', () => {
    const [d] = pilot([duty({ date: '2026-06-03', dutyType: 'Standby Airport', dutyCode: 'SBY', departureTime: '06:00', arrivalTime: '10:00' })]);
    expect(d.minutes).toBe(120);
  });

  it('does not count the 24-hour reserve at all', () => {
    const [d] = pilot([duty({ date: '2026-06-04', dutyType: 'Standby Home', dutyCode: 'R24' })]);
    expect(d).toMatchObject({ span: 1440, minutes: 0 });
  });

  it('measures the 7- and 28-day windows, the quarter and the year', () => {
    // 8 flight days of 10h30 counted (report 06:00, last on-blocks 16:00, +30 debrief).
    const days = Array.from({ length: 8 }, (_, i) => flightDay(`2026-10-${String(i + 1).padStart(2, '0')}`, '06:00', '07:00', '16:00'));
    const t = aeDutyTime(days, '2026-10-16');
    expect(t.days7.minutes).toBe(7 * 630);
    expect(t.days28.minutes).toBe(8 * 630);
    expect(t.quarter).toEqual({ minutes: 8 * 630, label: '4.º trim. 2026' });
    expect(t.year).toBe(8 * 630);
  });

  it('measures the quarter from the current one on, leaving past quarters out', () => {
    const t = aeDutyTime([flightDay('2026-09-30'), flightDay('2026-10-01')], '2026-10-16');
    expect(t.quarter).toEqual({ minutes: 360, label: '4.º trim. 2026' });
  });
});

// A day with no flying counts its sessions, not the gap between them (RRRGS cl. 12.1 a, RUPT def. 46).
describe('dutyDays — dias só em terra', () => {
  const session = (date: string, code: string, from: string, to: string, type = 'Training') =>
    duty({ date, dutyType: type, dutyCode: code, reportingTime: from, departureTime: from, arrivalTime: to });
  const courseDay = (date: string) => [session(date, 'FP1', '09:30', '12:30'), session(date, 'FP2', '14:00', '17:00')];

  it('leaves the lunch break between two training sessions out', () => {
    const [d] = dutyDays(courseDay('2026-10-25'), PGA_PILOT_RULES);
    expect(d.minutes).toBe(360); // 3h + 3h, not 09:30 → 17:00
  });

  it('counts overlapping sessions once', () => {
    const [d] = dutyDays([
      session('2026-10-25', 'FP1', '09:00', '12:00'),
      session('2026-10-25', 'SIM', '11:00', '13:00', 'Simulator'),
    ], PGA_PILOT_RULES);
    expect(d.minutes).toBe(240); // 09:00 → 13:00
  });

  it('keeps the whole span on a day that includes flying', () => {
    const [d] = dutyDays([
      session('2026-10-25', 'RGTC1', '08:00', '09:00'),
      duty({ date: '2026-10-25', dutyType: 'Flight Duty', reportingTime: '11:00', departureTime: '12:00', arrivalTime: '13:00' }),
    ], PGA_PILOT_RULES);
    expect(d.minutes).toBe(5 * 60 + 30); // 08:00 → 13:00 + 30 min debrief
  });

  it('puts a six-day course at 36h in the 7-day window, not 45h', () => {
    const days = ['25', '26', '27', '28', '29', '30'].flatMap((d) => courseDay(`2026-10-${d}`));
    expect(aeDutyTime(days, '2026-10-16').days7.minutes).toBe(36 * 60);
  });
});
