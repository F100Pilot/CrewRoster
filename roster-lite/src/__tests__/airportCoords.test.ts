import { describe, it, expect } from 'vitest';
import { airportCoord } from '../domain/airportCoords';
import { AIRPORT_COORD } from '../domain/airports';
import { buildFlightNetwork } from '../domain/flightMap';

describe('airportCoord', () => {
  it('returns curated coordinates for the PGA/TAP network', () => {
    expect(airportCoord('LIS')).toEqual(AIRPORT_COORD.LIS);
    expect(airportCoord('lis')).toEqual(AIRPORT_COORD.LIS); // case-insensitive
  });

  it('falls back to the worldwide table for out-of-network airports', () => {
    // JFK is not in the curated network table but must still resolve from the fallback.
    expect(AIRPORT_COORD.JFK).toBeUndefined();
    const jfk = airportCoord('JFK');
    expect(jfk).not.toBeNull();
    expect(jfk!.lat).toBeCloseTo(40.64, 1);
    expect(jfk!.lon).toBeCloseTo(-73.78, 1);
  });

  it('returns null for an unknown / invalid code', () => {
    expect(airportCoord('ZZZ')).toBeNull();
    expect(airportCoord('')).toBeNull();
    expect(airportCoord(null)).toBeNull();
  });
});

describe('buildFlightNetwork with the fallback', () => {
  it('places an out-of-network destination on the map instead of dropping it', () => {
    const net = buildFlightNetwork([{ from: 'LIS', to: 'JFK' }]);
    expect(net.unknown).toEqual([]); // nothing dropped
    expect(net.airports.map((a) => a.code).sort()).toEqual(['JFK', 'LIS']);
    expect(net.routes).toHaveLength(1);
  });

  it('still reports a genuinely unknown code as unmapped', () => {
    const net = buildFlightNetwork([{ from: 'LIS', to: 'ZZZ' }]);
    expect(net.unknown).toEqual(['ZZZ']);
    expect(net.airports.map((a) => a.code)).toEqual(['LIS']);
  });
});
