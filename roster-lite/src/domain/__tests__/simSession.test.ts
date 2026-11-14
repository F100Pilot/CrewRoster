import { describe, expect, it } from 'vitest';
import { asWorked, ebtBriefing, ebtBriefingText } from '../simSession';
import { dutyDays, workWindow, PGA_PILOT_RULES } from '../dutyTime';
import { DEFAULT_PAY_SETTINGS, payEstimate } from '../payEstimate';
import type { ParsedDuty } from '../types';

describe('ebtBriefing', () => {
  it('day 1: 30-min briefing, 1-hour debriefing; day 2 the other way round', () => {
    expect(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'LIS-EBT-1' })).toEqual({ day: 1, briefMin: 30, debriefMin: 60 });
    expect(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'LIS-EBT-2' })).toEqual({ day: 2, briefMin: 60, debriefMin: 30 });
    expect(ebtBriefingText(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'LIS-EBT-1' })!)).toBe('briefing 30 min · debriefing 1 h');
  });

  it('nothing for other simulator sessions or other duties', () => {
    expect(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'LIS-OTHER' })).toBeNull();
    expect(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'E90-FRA-1' })).toBeNull();
    expect(ebtBriefing({ dutyType: 'Training', dutyCode: 'LIS-EBT-1' })).toBeNull();
  });
});

describe('EBT duty = briefing + session + debriefing', () => {
  const sim = (date: string, code: string, a: string, z: string) => ({
    date, dutyCode: code, dutyType: 'Simulator', flightNumber: null, departureAirport: 'LIS', arrivalAirport: null,
    departureTime: a, arrivalTime: z, reportingTime: a, aircraftType: 'E90', observations: null,
  } as ParsedDuty);

  it('widens only the duty maths, not the roster times', () => {
    const d = sim('2026-11-12', 'LIS-EBT-1', '09:00', '13:00');
    expect(asWorked(d)).toMatchObject({ reportingTime: '08:30', departureTime: '08:30', arrivalTime: '14:00' });
    expect(d.departureTime).toBe('09:00');
    expect(asWorked(sim('2026-11-12', 'LIS-OTHER', '09:00', '13:00')).departureTime).toBe('09:00');
  });

  it('counts 5h30 for a 4h EBT-1 session and 6h30 for a 5h EBT-2 one', () => {
    const days = dutyDays([sim('2026-11-12', 'LIS-EBT-1', '09:00', '13:00'), sim('2026-11-13', 'LIS-EBT-2', '09:00', '14:00')], PGA_PILOT_RULES);
    expect(days.map((x) => x.minutes)).toEqual([330, 390]);
    const w = workWindow('2026-11-12', [sim('2026-11-12', 'LIS-EBT-1', '09:00', '13:00')], PGA_PILOT_RULES)!;
    expect([w.start.toISOString(), w.end.toISOString()]).toEqual(['2026-11-12T08:30:00.000Z', '2026-11-12T14:00:00.000Z']);
  });

  it('puts the duty-pay credit on the whole duty; block-pay keeps the session', () => {
    const r = payEstimate([sim('2026-11-12', 'LIS-EBT-1', '09:00', '13:00')], '2026-11', DEFAULT_PAY_SETTINGS, '2026-11-30');
    expect(r.duty.credited).toBe(330);
    expect(r.block.credited).toBe(240);
  });
});

describe('medical exams: IM + VIM count as the IM block', () => {
  const med = (date: string, code: string, a: string, z: string) => ({
    date, dutyCode: code, dutyType: 'Medical', flightNumber: null, departureAirport: 'LIS', arrivalAirport: null,
    departureTime: a, arrivalTime: z, reportingTime: a, aircraftType: null, observations: null,
  } as ParsedDuty);

  it('IM 08:00–12:00 + VIM 12:00–12:30 = 4h00 (the roster DT); MED apart = 3h00', () => {
    const days = dutyDays([
      med('2026-06-02', 'MED', '08:00', '11:00'),
      med('2026-06-19', 'IM', '08:00', '12:00'), med('2026-06-19', 'VIM', '12:00', '12:30'),
    ], PGA_PILOT_RULES);
    expect(days.map((x) => [x.date, x.minutes])).toEqual([['2026-06-02', 180], ['2026-06-19', 240]]);
    expect(workWindow('2026-06-19', [med('2026-06-19', 'IM', '08:00', '12:00'), med('2026-06-19', 'VIM', '12:00', '12:30')], PGA_PILOT_RULES)!.end.toISOString())
      .toBe('2026-06-19T12:00:00.000Z');
  });

  it('a VIM on its own still counts', () => {
    expect(dutyDays([med('2026-06-20', 'VIM', '12:00', '12:30')], PGA_PILOT_RULES)[0].minutes).toBe(30);
  });
});

describe('APT (assistência no aeroporto)', () => {
  it('counts at the airport-standby share for pilots (50%)', () => {
    const apt = { date: '2026-09-09', dutyCode: 'APT', dutyType: 'Standby Airport', flightNumber: null, departureAirport: 'LIS', arrivalAirport: null,
      departureTime: '06:00', arrivalTime: '12:00', reportingTime: '06:00', aircraftType: null, observations: null } as ParsedDuty;
    expect(dutyDays([apt], PGA_PILOT_RULES)[0].minutes).toBe(180);
  });
});

