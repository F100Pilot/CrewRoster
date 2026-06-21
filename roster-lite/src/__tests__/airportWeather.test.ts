import { describe, expect, it } from 'vitest';
import { describeWeatherCode, windCardinal } from '../utils/airportWeather';

describe('describeWeatherCode', () => {
  it('maps known WMO codes to PT labels', () => {
    expect(describeWeatherCode(0).label).toBe('Céu limpo');
    expect(describeWeatherCode(3).label).toBe('Nublado');
    expect(describeWeatherCode(65).label).toBe('Chuva forte');
    expect(describeWeatherCode(95).label).toBe('Trovoada');
  });
  it('falls back for unknown codes', () => {
    expect(describeWeatherCode(123).label).toBe('—');
  });
});

describe('windCardinal', () => {
  it('maps degrees to 16-point compass', () => {
    expect(windCardinal(0)).toBe('N');
    expect(windCardinal(90)).toBe('E');
    expect(windCardinal(180)).toBe('S');
    expect(windCardinal(270)).toBe('W');
    expect(windCardinal(360)).toBe('N');
  });
});
