import { describe, it, expect } from 'vitest';
import { sectorSun } from '../domain/sectorSun';

// Lisbon, late June: sunrise ~05:1x z, sunset ~20:0x z.
describe('sectorSun', () => {
  it('marks a midday flight as fully daytime (no night minutes)', () => {
    const s = sectorSun('LIS', 'OPO', '2026-06-21', '12:00', '13:00')!;
    expect(s).not.toBeNull();
    expect(s.depDay).toBe(true);
    expect(s.arrDay).toBe(true);
    expect(s.nightMin).toBe(0);
    expect(s.blockMin).toBe(60);
    expect(s.profile.length).toBe(33);
    expect(s.profile.every(Boolean)).toBe(true); // all-day profile for the bar
    expect(s.depSun.sunriseUtc).toMatch(/^0[45]:/); // sunrise around 05z
  });

  it('counts night minutes on a late-evening flight', () => {
    const s = sectorSun('LIS', 'OPO', '2026-06-21', '23:00', '23:45')!;
    expect(s.depDay).toBe(false);
    expect(s.nightMin).toBeGreaterThan(0);
    expect(s.nightMin).toBeLessThanOrEqual(s.blockMin);
    expect(s.profile.some((d) => !d)).toBe(true); // some night in the profile
  });

  it('handles an overnight sector (arrival past midnight) without going negative', () => {
    const s = sectorSun('LIS', 'OPO', '2026-06-21', '23:30', '00:30')!;
    expect(s.blockMin).toBe(60);
    expect(s.nightMin).toBeGreaterThan(0);
  });

  it('returns null when an airport is outside the curated network or times are missing', () => {
    expect(sectorSun('LIS', 'ZZZ', '2026-06-21', '12:00', '13:00')).toBeNull();
    expect(sectorSun('LIS', 'OPO', '2026-06-21', null, '13:00')).toBeNull();
  });
});
