import { describe, expect, it } from 'vitest';
import { asWorked, ebtBriefing, ebtBriefingText } from '../simSession';
import { dutyDays, workWindow, PGA_PILOT_RULES } from '../dutyTime';
import { DEFAULT_PAY_SETTINGS, payEstimate } from '../payEstimate';
import type { ParsedDuty } from '../types';

describe('ebtBriefing', () => {
  it('day 1: 30-min briefing, 1-hour debriefing; day 2 the other way round', () => {
    expect(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'LIS-EBT-1' })).toEqual({ day: 1, briefMin: 30, debriefMin: 60 });
    expect(ebtBriefing({ dutyType: 'Simulator', dutyCode: 'LIS-EBT-2' })).toEqual({ day: 2, briefMin: 60, debriefMin: 60 });
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

  it('counts 5h30 for a 4h EBT-1 session and 7h00 for a 5h EBT-2 one (4h EBT-2 = the roster\'s DT 06:00)', () => {
    const days = dutyDays([sim('2026-11-12', 'LIS-EBT-1', '09:00', '13:00'), sim('2026-11-13', 'LIS-EBT-2', '09:00', '14:00')], PGA_PILOT_RULES);
    expect(days.map((x) => x.minutes)).toEqual([330, 420]);
    const w = workWindow('2026-11-12', [sim('2026-11-12', 'LIS-EBT-1', '09:00', '13:00')], PGA_PILOT_RULES)!;
    expect([w.start.toISOString(), w.end.toISOString()]).toEqual(['2026-11-12T08:30:00.000Z', '2026-11-12T14:00:00.000Z']);
  });

  it('puts the duty-pay credit on the whole duty; block-pay keeps the session', () => {
    const r = payEstimate([sim('2026-11-12', 'LIS-EBT-1', '09:00', '13:00')], '2026-11', DEFAULT_PAY_SETTINGS, '2026-11-30');
    expect(r.duty.credited).toBe(330);
    expect(r.block.credited).toBe(240);
  });
});
