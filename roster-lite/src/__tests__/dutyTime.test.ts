import { describe, expect, it } from 'vitest';
import {
  DUTY_LIMITS, HOME_STANDBY_FACTOR, dutyDays, peakDutyTime, peakDutyWindow,
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

  it('counts a standby that turned into a flight as a full duty day', () => {
    const [d] = dutyDays([
      duty({ date: '2026-06-09', dutyType: 'Standby Home', departureTime: '06:00', arrivalTime: '10:00' }),
      duty({ date: '2026-06-09', dutyType: 'Flight Duty', departureTime: '11:00', arrivalTime: '15:00' }),
    ]);
    expect(d.partial).toBe(false);
    expect(d.minutes).toBe(540); // 06:00 → 15:00 in full
  });

  it('counts airport standby, simulator and training in full', () => {
    const days = dutyDays([
      duty({ date: '2026-06-10', dutyType: 'Standby Airport', departureTime: '06:00', arrivalTime: '10:00' }),
      duty({ date: '2026-06-11', dutyType: 'Simulator', departureTime: '08:00', arrivalTime: '12:00' }),
      duty({ date: '2026-06-12', dutyType: 'Training', departureTime: '09:00', arrivalTime: '12:00' }),
    ]);
    expect(days.map((d) => d.minutes)).toEqual([240, 240, 180]);
    expect(days.every((d) => !d.partial)).toBe(true);
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
