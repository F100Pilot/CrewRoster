import { describe, expect, it } from 'vitest';
import { computeRisk, windyEmbedUrl } from '../utils/turbulence';
import { midpoint } from '../domain/airports';

describe('computeRisk', () => {
  it('is low with calm shear, no deformation and no convection', () => {
    expect(computeRisk(0, 20, 0)).toBe('low');
  });

  it('keeps a normal jet crossing low (matches EDR-based products)', () => {
    // Real case: Ellrod 28, shear 70 km/h, CAPE 0 — Windy's CAT layer showed this as light, but
    // the old thresholds called it "high". It must read as low.
    expect(computeRisk(28, 70, 0)).toBe('low');
  });

  it('is moderate on strong vertical shear alone', () => {
    expect(computeRisk(0, 110, 0)).toBe('moderate');
    expect(computeRisk(0, 70, 0)).toBe('low'); // everyday jet shear stays low
  });

  it('is moderate on a strong Ellrod index alone', () => {
    expect(computeRisk(50, 10, 0)).toBe('moderate');
    expect(computeRisk(30, 10, 0)).toBe('low'); // routine deformation stays low
  });

  it('is moderate on moderate CAPE alone', () => {
    expect(computeRisk(0, 10, 1000)).toBe('moderate');
    expect(computeRisk(0, 10, 400)).toBe('low');
  });

  it('is high on very strong shear', () => {
    expect(computeRisk(0, 160, 0)).toBe('high');
  });

  it('is high on a very strong Ellrod index', () => {
    expect(computeRisk(90, 10, 0)).toBe('high');
  });

  it('is high on strong convection (CAPE)', () => {
    expect(computeRisk(0, 10, 2500)).toBe('high');
  });

  it('takes the worst of the three proxies', () => {
    expect(computeRisk(10, 110, 0)).toBe('moderate'); // shear escalates
    expect(computeRisk(10, 10, 2500)).toBe('high'); // convection escalates
  });
});

describe('windyEmbedUrl', () => {
  it('returns null when an airport is unknown', () => {
    expect(windyEmbedUrl('LIS', 'ZZZ')).toBeNull();
    expect(windyEmbedUrl(null, 'NCE')).toBeNull();
  });

  it('builds an embed URL centred between the two airports', () => {
    const url = windyEmbedUrl('LIS', 'NCE');
    expect(url).toContain('embed.windy.com/embed2.html');
    expect(url).toContain('overlay=turbulence');
    expect(url).toContain('level=250h');
  });
});

describe('midpoint', () => {
  it('falls roughly between the endpoints', () => {
    const mid = midpoint({ lat: 38.774, lon: -9.134 }, { lat: 43.658, lon: 7.216 });
    expect(mid.lat).toBeGreaterThan(38.7);
    expect(mid.lat).toBeLessThan(43.7);
    expect(mid.lon).toBeGreaterThan(-9.2);
    expect(mid.lon).toBeLessThan(7.3);
  });
});
