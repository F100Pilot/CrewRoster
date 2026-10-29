import { describe, expect, it } from 'vitest';
import { lisbonLocal, lisbonMidnightUtc, lisbonLocalToUtc } from '../domain/standbyWindows';

// Lisbon time around the clock changes (last Sunday of March / October, at 01:00 UTC).
describe('hora de Lisboa', () => {
  it('puts local midnight at 23:00 UTC in summer and 00:00 UTC in winter', () => {
    expect(lisbonMidnightUtc('2026-07-15')).toBe(Date.parse('2026-07-14T23:00:00Z'));
    expect(lisbonMidnightUtc('2026-12-15')).toBe(Date.parse('2026-12-15T00:00:00Z'));
  });

  it('keeps summer time for midnight on the night the clocks go back', () => {
    expect(lisbonMidnightUtc('2026-10-25')).toBe(Date.parse('2026-10-24T23:00:00Z'));
    expect(lisbonMidnightUtc('2026-10-26')).toBe(Date.parse('2026-10-26T00:00:00Z'));
  });

  it('reads the repeated hour on both sides of the change', () => {
    expect(lisbonLocal(Date.parse('2026-10-25T00:30:00Z'))).toEqual({ date: '2026-10-25', minutes: 90 }); // 01:30 summer
    expect(lisbonLocal(Date.parse('2026-10-25T01:30:00Z'))).toEqual({ date: '2026-10-25', minutes: 90 }); // 01:30 winter
  });

  it('converts a local clock time to UTC by the season', () => {
    expect(lisbonLocalToUtc('2026-07-15', '07:00')).toBe('06:00');
    expect(lisbonLocalToUtc('2026-12-15', '07:00')).toBe('07:00');
  });
});
