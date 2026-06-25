import { describe, expect, it } from 'vitest';
import { computeRisk, windyEmbedUrl } from '../utils/turbulence';
import { midpoint } from '../domain/airports';

describe('computeRisk', () => {
  it('is low with calm shear, no deformation and no convection', () => {
    expect(computeRisk(0, 20, 0)).toBe('low');
  });

  it('is moderate on meaningful vertical shear alone', () => {
    expect(computeRisk(0, 50, 0)).toBe('moderate');
  });

  it('is moderate on a moderate Ellrod index alone', () => {
    expect(computeRisk(5, 10, 0)).toBe('moderate');
  });

  it('is moderate on moderate CAPE alone', () => {
    expect(computeRisk(0, 10, 400)).toBe('moderate');
  });

  it('is high on strong shear', () => {
    expect(computeRisk(0, 80, 0)).toBe('high');
  });

  it('is high on a strong Ellrod index', () => {
    expect(computeRisk(10, 10, 0)).toBe('high');
  });

  it('is high on strong convection (CAPE)', () => {
    expect(computeRisk(0, 10, 1200)).toBe('high');
  });

  it('takes the worst of the three proxies', () => {
    expect(computeRisk(1, 50, 1200)).toBe('high');
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
    expect(url).toContain('overlay=wind');
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
