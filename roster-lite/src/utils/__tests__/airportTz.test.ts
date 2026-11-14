import { describe, expect, it } from 'vitest';
import { airportTz } from '../localTime';
import { AIRPORT_COORD } from '../../domain/airports';

// Without a timezone an airport is read on the base's clock — an hour off for Spain, France, Italy…
// (Sept 2026: an ALC sector looked like it left before lunch and the app paid a lunch the company had
// loaded). Every airport the app knows the position of must also have its timezone.
describe('airport timezones', () => {
  it('covers every airport in the coordinates table', () => {
    expect(Object.keys(AIRPORT_COORD).filter((c) => !airportTz(c))).toEqual([]);
  });

  it('knows Alicante is on Madrid time', () => {
    expect(airportTz('ALC')).toBe('Europe/Madrid');
  });
});
