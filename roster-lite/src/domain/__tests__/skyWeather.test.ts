import { describe, expect, it } from 'vitest';
import { bodyVisible, conditionOf, moonLitPath, moonPhase } from '../skyWeather';

describe('conditionOf', () => {
  it('maps the WMO codes to what the sky shows', () => {
    expect(conditionOf(0)).toBe('clear');
    expect(conditionOf(2)).toBe('partly');
    expect(conditionOf(3)).toBe('cloudy');
    expect(conditionOf(45)).toBe('fog');
    expect(conditionOf(53)).toBe('drizzle');
    expect(conditionOf(63)).toBe('rain');
    expect(conditionOf(81)).toBe('rain');
    expect(conditionOf(73)).toBe('snow');
    expect(conditionOf(95)).toBe('thunder');
    expect(conditionOf(99)).toBe('thunder');
  });

  it('lets the cloud cover settle the fair-weather codes', () => {
    expect(conditionOf(1, 80)).toBe('cloudy');
    expect(conditionOf(0, 40)).toBe('partly');
    expect(conditionOf(0, 10)).toBe('clear');
    expect(conditionOf(63, 0)).toBe('rain');
  });

  it('hides the sun and the moon behind a closed sky', () => {
    expect(bodyVisible('clear')).toBe(true);
    expect(bodyVisible('partly')).toBe(true);
    expect(bodyVisible('rain')).toBe(false);
    expect(bodyVisible('fog')).toBe(false);
  });
});

describe('moonPhase', () => {
  it('is near new and full on known dates', () => {
    // New moon 2024-01-11 11:57 UTC, full moon 2024-01-25 17:54 UTC.
    const n = moonPhase(new Date(Date.UTC(2024, 0, 11, 12)));
    expect(Math.min(n, 1 - n)).toBeLessThan(0.03);
    expect(Math.abs(moonPhase(new Date(Date.UTC(2024, 0, 25, 18))) - 0.5)).toBeLessThan(0.03);
  });

  it('stays in [0, 1) before the reference too', () => {
    const p = moonPhase(new Date(Date.UTC(1990, 5, 1)));
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
  });
});

describe('moonLitPath', () => {
  it('draws the lit side on the right when waxing and on the left when waning', () => {
    expect(moonLitPath(0.2, 10, 10, 8)).toMatch(/A 8 8 0 0 1 10 18/);
    expect(moonLitPath(0.8, 10, 10, 8)).toMatch(/A 8 8 0 0 0 10 18/);
  });

  it('is a full disc at full moon', () => {
    // At full moon the terminator is a full-width half ellipse on the far side.
    expect(moonLitPath(0.5, 10, 10, 8)).toMatch(/A 8 8 0 0 0 10 2/);
  });
});
