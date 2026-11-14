import { describe, expect, it } from 'vitest';
import { airportTz, toLocalTime, tzOffsetMinutes } from '../localTime';
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

  it('has Morocco on UTC+0 from 20 Sep 2026, whatever timezone data the device has', () => {
    expect(tzOffsetMinutes(new Date('2026-09-21T10:45:00Z'), 'Africa/Casablanca')).toBe(0);
    expect(toLocalTime('2026-09-21', '10:45', 'RAK')).toBe('10:45');
    expect(tzOffsetMinutes(new Date('2026-08-15T12:00:00Z'), 'Africa/Casablanca')).toBe(60);
  });
});
