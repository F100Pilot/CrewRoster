import { describe, expect, it } from 'vitest';
import { aeCompliance, dutyTags, holidayCount } from '../domain/aeCompliance';
import type { ParsedDuty } from '../domain/types';

// Synthetic rosters, one letter per day from a start date (June 2026: Lisbon is UTC+1).
//   F  flight day, report 06:00Z (07:00 local), LIS-OPO-LIS, done 10:00Z
//   E  Early Start: report 04:30Z = 05:30 local
//   L  Late Finish: last on-blocks 22:45Z, +30 → 23:15Z = 00:15 local
//   N  Night Duty: report 00:30Z = 01:30 local, through 02:00–04:59 local
//   T  ground training 08:00–12:00Z
//   O  folga (W_OFF)      V  holiday (PLIC)      -  no entry (unknown)
function base(date: string, p: Partial<ParsedDuty>): ParsedDuty {
  return {
    date, dutyCode: 'FLT', dutyType: 'Flight Duty', flightNumber: null, departureAirport: null,
    arrivalAirport: null, departureTime: null, arrivalTime: null, reportingTime: null,
    aircraftType: null, observations: null, ...p,
  } as ParsedDuty;
}
const leg = (date: string, from: string, to: string, off: string, on: string, report: string | null = null) =>
  base(date, { departureAirport: from, arrivalAirport: to, departureTime: off, arrivalTime: on, reportingTime: report });

function roster(start: string, pattern: string): ParsedDuty[] {
  const out: ParsedDuty[] = [];
  [...pattern].forEach((c, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    if (c === 'F') out.push(leg(date, 'LIS', 'OPO', '07:00', '08:00', '06:00'), leg(date, 'OPO', 'LIS', '09:00', '10:00'));
    if (c === 'E') out.push(leg(date, 'LIS', 'OPO', '05:30', '06:30', '04:30'), leg(date, 'OPO', 'LIS', '07:15', '08:15'));
    if (c === 'L') out.push(leg(date, 'LIS', 'OPO', '18:00', '19:00', '17:00'), leg(date, 'OPO', 'LIS', '21:45', '22:45'));
    if (c === 'N') out.push(leg(date, 'LIS', 'OPO', '01:30', '02:30', '00:30'), leg(date, 'OPO', 'LIS', '03:15', '04:15'));
    if (c === 'T') out.push(base(date, { dutyType: 'Training', dutyCode: 'RGTC1', departureTime: '08:00', arrivalTime: '12:00' }));
    if (c === 'O') out.push(base(date, { dutyType: 'Day Off', dutyCode: 'OFF' }));
    if (c === 'V') out.push(base(date, { dutyType: 'Vacation', dutyCode: 'PLIC' }));
  });
  return out;
}
const check = (duties: ParsedDuty[], id: string, ref = '2026-06-15') => aeCompliance(duties, ref).find((c) => c.id === id)!;

describe('dutyTags (RUPT def. 14/19/22, cl. 22.7)', () => {
  const tagsOf = (c: string) => dutyTags('2026-06-10', roster('2026-06-10', c));
  it('tags an Early Start, a Late Finish and a Night Duty', () => {
    expect(tagsOf('E')).toEqual(['ES']);
    expect(tagsOf('L')).toEqual(['LF']);
    expect(tagsOf('N')).toEqual(['ND']);
  });
  it('leaves an ordinary day and a ground day untagged', () => {
    expect(tagsOf('F')).toEqual([]);
    expect(tagsOf('T')).toEqual([]);
  });
});

describe('folgas no mês (cl. 21.2)', () => {
  // June 2026 has 30 days: 10 folgas in two-day periods, 20 flight days.
  const june = 'FFFOOFFFOOFFFFOOFFFOOFFFOOFFFF';

  it('is met with 10 folgas', () => {
    const c = check(roster('2026-06-01', june), 'folgas-mes');
    expect(c.status).toBe('ok');
    expect(c.detail).toContain('junho: 10 (mín. 10)');
  });

  it('warns with 9', () => {
    const nine = june.replace(/OO(?!.*OO)/, 'OF'); // last folga period loses a day
    expect(check(roster('2026-06-01', nine), 'folgas-mes')).toMatchObject({ status: 'warn', detail: 'junho: 9 (mín. 10)' });
  });

  it('lowers the minimum by 2 for every 7 days of holiday', () => {
    const c = check(roster('2026-06-01', 'VVVVVVV' + 'FFFOOFFFOOFFFOOFFFFOOFFFF'.slice(0, 23)), 'folgas-mes');
    expect(c.detail).toContain('(mín. 8)');
  });

  it('does not judge a month the roster only partly covers', () => {
    expect(check(roster('2026-06-09', 'FFFOOFFFOO'), 'folgas-mes').status).toBe('na');
  });
});

describe('intervalo entre folgas (cl. 21.3)', () => {
  it('accepts 6 days between folga periods', () => {
    expect(check(roster('2026-06-01', 'OOFFFFFFOOFFFFFFOO'), 'intervalo-folgas').status).toBe('ok');
  });
  it('warns at 7', () => {
    expect(check(roster('2026-06-01', 'OOFFFFFFFOO'), 'intervalo-folgas'))
      .toMatchObject({ status: 'warn', detail: '7 dias seguidos (03/06–09/06)' });
  });
  it('does not take a single day off as a folga period (it needs 48h)', () => {
    expect(check(roster('2026-06-01', 'OOFFFFOFFFOO'), 'intervalo-folgas').status).toBe('warn');
  });
  it('lets a holiday break the stretch', () => {
    expect(check(roster('2026-06-01', 'OOFFFFVVVFFFFOO'), 'intervalo-folgas').status).toBe('ok');
  });
  it('lets a gap in the imported data break it too', () => {
    expect(check(roster('2026-06-01', 'OOFFFF--FFFFOO'), 'intervalo-folgas').status).toBe('ok');
  });
});

describe('folgas de 72h / 96h (cl. 21.4)', () => {
  it('is met with two 3-day folga periods in a month of exactly 10', () => {
    expect(check(roster('2026-06-01', 'FFFOOOFFFFOOOFFFFFOOFFFFOOFFFF'), 'folgas-72-96').status).toBe('ok');
  });
  it('is met with one 4-day period', () => {
    expect(check(roster('2026-06-01', 'FFFOOOOFFFFOOFFFFFOOFFFFOOFFFF'), 'folgas-72-96').status).toBe('ok');
  });
  it('warns with only 2-day periods', () => {
    expect(check(roster('2026-06-01', 'FFFOOFFFOOFFFFOOFFFOOFFFOOFFFF'), 'folgas-72-96').status).toBe('warn');
  });
  it('does not apply to a month with more than 10 folgas', () => {
    expect(check(roster('2026-06-01', 'FFOOFFFOOFFFOOFFFOOFFFOOFFFOOF'), 'folgas-72-96').status).toBe('na');
  });
});

describe('fim de semana de folga (cl. 21.8)', () => {
  // 2026-05-09 is a Saturday. Folgas always Mon–Tue: no Saturday+Sunday off for 7+ weeks.
  const weekdaysOff = 'FFOOFFF'.repeat(8); // Sat, Sun, Mon(O), Tue(O), …
  it('warns after more than 6 weeks without a Saturday and Sunday off', () => {
    expect(check(roster('2026-05-09', weekdaysOff), 'fim-de-semana').status).toBe('warn');
  });
  it('is met when a weekend off comes round in time', () => {
    const withWeekend = 'OOFFFFF' + 'FFOOFFF'.repeat(4) + 'OOFFFFF' + 'FFOOFFF'; // weekends off on 09/05 and 13/06
    expect(check(roster('2026-05-09', withWeekend), 'fim-de-semana')).toMatchObject({ status: 'ok' });
  });
  it('lets a holiday suspend the count', () => {
    const holiday = 'FFOOFFF'.repeat(3) + 'VVVVVVV' + 'FFOOFFF'.repeat(4);
    expect(check(roster('2026-05-09', holiday), 'fim-de-semana').status).not.toBe('warn');
  });
});

describe('descanso semanal de 36h (cl. 15.2)', () => {
  it('is met with two days off every week', () => {
    expect(check(roster('2026-06-01', 'FFFFFOO'.repeat(3)), 'descanso-semanal').status).toBe('ok');
  });
  it('warns after 8 working days without 36h free including two nights', () => {
    expect(check(roster('2026-06-01', 'FFFFFFFFOO'), 'descanso-semanal').status).toBe('warn');
  });
  it('does not flag a roster that simply ends mid-week', () => {
    expect(check(roster('2026-06-01', 'FFFFFOOFFFF'), 'descanso-semanal').status).toBe('ok');
  });
});

describe('Early Start / Late Finish / Night Duty (cl. 22)', () => {
  it('accepts two in a row', () => {
    expect(check(roster('2026-06-01', 'OOLLFFOO'), 'es-lf-nd').status).toBe('ok');
  });
  it('warns at three in a row', () => {
    expect(check(roster('2026-06-01', 'OOLLLFOO'), 'es-lf-nd')).toMatchObject({ status: 'warn', detail: '3 seguidos até 05/06' });
  });
  it('allows three Early Starts in a row between folga periods', () => {
    expect(check(roster('2026-06-01', 'OOEEEOO'), 'es-lf-nd').status).toBe('ok');
  });
  it('warns at four between folga periods even when not consecutive', () => {
    expect(check(roster('2026-06-01', 'OOLFLFNFEOO'), 'es-lf-nd').status).toBe('warn');
  });
});

describe('férias (cl. 38)', () => {
  it('counts PLIC / SLIC / RLIC calendar days in the year, and F apart', () => {
    const v = (date: string, code: string) => base(date, { dutyType: 'Vacation', dutyCode: code });
    const c = holidayCount([
      v('2026-07-01', 'PLIC'), v('2026-07-02', 'PLIC'), v('2026-10-31', 'RLIC'), v('2026-11-01', 'SLIC'),
      v('2026-11-11', 'F'), v('2026-11-12', 'F'),
      v('2025-12-31', 'PLIC'), // other year
      base('2026-07-03', { dutyType: 'Day Off', dutyCode: 'OFF' }),
    ], 2026);
    expect(c).toEqual({ year: 2026, calendarDays: 4, carriedDays: 2, entitlement: 42 });
  });
});

describe('textos dos avisos', () => {
  it('says when the late weekly rest began and what the limit was', () => {
    // Folgas 01–02/06, then 6 ground days 03–08 ending 16:00Z (17:00 local), then folgas.
    const d = roster('2026-06-01', 'OO') .concat(
      ['03', '04', '05', '06', '07', '08'].map((x) => base(`2026-06-${x}`, { dutyType: 'Office Duty', dutyCode: 'S.EXT.', departureTime: '08:00', arrivalTime: '16:00' })),
      roster('2026-06-09', 'OO'));
    expect(check(d, 'descanso-semanal').detail).toBe('o descanso só começa 08/06 às 17:00 (limite: 08/06 às 14:00)');
  });

  it('notes the course exception on a folga warning that involves training or S.EXT.', () => {
    expect(check(roster('2026-06-01', 'OOFFFTFFFOO'), 'intervalo-folgas').note).toMatch(/cl\. 7\.1/);
  });

  it('adds no such note when the stretch is all flying', () => {
    expect(check(roster('2026-06-01', 'OOFFFFFFFOO'), 'intervalo-folgas').note).toBeUndefined();
  });

  it('never adds it to the weekly rest, which courses do not waive', () => {
    expect(check(roster('2026-06-01', 'TTTTTTTTOO'), 'descanso-semanal').note).toBeUndefined();
  });
});
