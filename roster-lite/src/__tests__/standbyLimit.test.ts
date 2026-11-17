import { describe, expect, it } from 'vitest';
import { mergeDuties } from '../domain/rosterMerge';
import { standbyByMonth, standbyDays } from '../domain/standbyLimit';
import type { ParsedDuty } from '../domain/types';

const d = (date: string, dutyCode: string, dutyType: string, p: Partial<ParsedDuty> = {}): ParsedDuty => ({
  date, dutyCode, dutyType, reportingTime: null, departureTime: null, arrivalTime: null, flightNumber: null,
  departureAirport: null, arrivalAirport: null, aircraftType: null, observations: null, ...p,
});
const flight = (date: string) => d(date, 'TP9101', 'Flight Duty', { flightNumber: 'TP9101', departureAirport: 'LIS', arrivalAirport: 'OPO', departureTime: '07:00', arrivalTime: '08:00' });

describe('standbys of the year (RUPT cl. 19.24 / 19.16)', () => {
  it('keeps a standby used to fly on its day, so it still counts as planned', () => {
    // The month's roster: H509 on the 3rd, R24 on the 4th, APT on the 5th.
    const planned = [d('2026-11-03', 'H509', 'Standby Home'), d('2026-11-04', 'R24', 'Standby Home'), d('2026-11-05', 'APT', 'Standby Airport')];
    // After the day: called out on the 3rd (a flight), the 4th's reserve became a folga.
    const later = mergeDuties(planned, [flight('2026-11-03'), d('2026-11-04', 'W_OFF', 'Day Off')], '2026-11-06');
    expect(later.find((x) => x.date === '2026-11-03')!.plannedStandby).toBe('H509');
    // Another sync keeps it (the code a day carried wins).
    const again = mergeDuties(later, [flight('2026-11-03')], '2026-11-07');
    expect(again.find((x) => x.date === '2026-11-03')!.plannedStandby).toBe('H509');
    const days = standbyDays(again, '2026');
    expect(days.map((x) => [x.date, x.code, x.used, x.kind])).toEqual([
      ['2026-11-03', 'H509', true, 'home'],
      ['2026-11-04', 'R24', true, 'reserve'],
      ['2026-11-05', 'APT', false, 'airport'],
    ]);
    expect(standbyByMonth(days)).toMatchObject([{ month: '2026-11', reserves: 1, airport: 1 }]);
  });

  it('never marks a day that is still a standby, or one that never was', () => {
    const out = mergeDuties([d('2026-11-03', 'H7+', 'Standby Home'), flight('2026-11-04')], [d('2026-11-03', 'H509', 'Standby Home'), flight('2026-11-04')], '2026-11-01');
    expect(out.every((x) => !x.plannedStandby)).toBe(true);
    expect(standbyDays(out, '2026')).toHaveLength(1);
  });
});

describe('reserves count with the standbys (a tester: "tens de contar as reservas também")', () => {
  it('reads the other spellings of the 24-hour reserve and counts them in the 24', async () => {
    const { inferDutyType } = await import('../domain/dutyType');
    for (const code of ['R24', 'RSV', 'RSV24', 'RES', 'RES24', 'R24H']) expect(inferDutyType(code)).toMatch(/Reserve|Standby Home/);
    const days = standbyDays([
      d('2026-12-01', 'H616', 'Standby Home'), d('2026-12-02', 'R24', 'Standby Home'),
      d('2026-12-03', 'RSV24', inferDutyType('RSV24')), d('2026-12-04', 'W_OFF', 'Day Off'),
    ], '2026');
    expect(days.map((x) => x.kind)).toEqual(['home', 'reserve', 'reserve']);
  });
});
