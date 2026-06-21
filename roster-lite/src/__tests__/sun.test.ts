import { describe, expect, it } from 'vitest';
import { sunTimes, isDaylight } from '../utils/sun';

// Lisbon (LIS): lat 38.77, lon -9.13.
const LIS = { lat: 38.77, lon: -9.13 };

function mins(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

describe('sunTimes (Lisbon)', () => {
  it('June solstice: sunrise ~05:11z, sunset ~20:05z', () => {
    const { sunriseUtc, sunsetUtc } = sunTimes(LIS.lat, LIS.lon, '2026-06-21');
    expect(mins(sunriseUtc!)).toBeGreaterThanOrEqual(mins('04:50'));
    expect(mins(sunriseUtc!)).toBeLessThanOrEqual(mins('05:30'));
    expect(mins(sunsetUtc!)).toBeGreaterThanOrEqual(mins('19:45'));
    expect(mins(sunsetUtc!)).toBeLessThanOrEqual(mins('20:25'));
  });

  it('December solstice has a later sunrise than June', () => {
    const jun = sunTimes(LIS.lat, LIS.lon, '2026-06-21').sunriseUtc!;
    const dec = sunTimes(LIS.lat, LIS.lon, '2026-12-21').sunriseUtc!;
    expect(mins(dec)).toBeGreaterThan(mins(jun));
  });
});

describe('isDaylight (Lisbon, June)', () => {
  it('noon is day, midnight is night', () => {
    expect(isDaylight(LIS.lat, LIS.lon, '2026-06-21', '12:00')).toBe(true);
    expect(isDaylight(LIS.lat, LIS.lon, '2026-06-21', '02:00')).toBe(false);
  });
});
