import { describe, expect, it } from 'vitest';
import { lastMonths, monthlyTotals, niceHourAxis } from '../domain/monthlyTotals';
import { PGA_PILOT_RULES } from '../domain/dutyTime';
import type { LogbookRow, ParsedDuty } from '../domain/types';

const row = (date: string, off: string, on: string) =>
  ({ key: `${date}${off}`, userId: 'u', date, off, on, from: 'LIS', to: 'OPO', flightNo: 'TP1' }) as unknown as LogbookRow;

const duty = (date: string, dutyType: string, extra: Partial<ParsedDuty> = {}) =>
  ({ date, dutyType, ...extra }) as ParsedDuty;

describe('monthlyTotals', () => {
  it('lists the last months oldest first, across a year boundary', () => {
    expect(lastMonths('2026-02-15', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(lastMonths('2026-10-29')).toHaveLength(12);
  });

  it('sums block per month and leaves duty unknown where no roster is stored', () => {
    const rows = [row('2026-09-03', '08:00', '09:00'), row('2026-09-20', '10:00', '11:30'), row('2026-10-01', '06:00', '07:00')];
    const duties = [duty('2026-10-01', 'Day Off'), duty('2026-10-02', 'Day Off')];
    const out = monthlyTotals(rows, duties, PGA_PILOT_RULES, '2026-10-29', 3);
    expect(out.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(out[0]).toEqual({ month: '2026-08', block: 0, duty: null });
    expect(out[1].block).toBe(150);
    expect(out[1].duty).toBeNull();
    // Covered by the roster, but nothing countable in it: 0, not unknown.
    expect(out[2]).toEqual({ month: '2026-10', block: 60, duty: 0 });
  });

  it('picks round axis steps', () => {
    expect(niceHourAxis(0)).toEqual({ top: 300, step: 300 });
    expect(niceHourAxis(87 * 60)).toEqual({ top: 100 * 60, step: 25 * 60 });
    expect(niceHourAxis(140 * 60)).toEqual({ top: 150 * 60, step: 50 * 60 });
  });
});
