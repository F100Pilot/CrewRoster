import { describe, expect, it } from 'vitest';
import { airportTz, iataSeasonStart, seasonPlanOffsetMinutes, toLocalTime, tzOffsetMinutes } from '../localTime';
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

  it('keeps Morocco on UTC+0 for good: no summer time and no Ramadan changes any more (user confirmed)', () => {
    for (const iso of ['2027-02-15T12:00:00Z', '2027-07-01T12:00:00Z', '2028-01-30T12:00:00Z', '2030-08-01T12:00:00Z']) {
      expect(tzOffsetMinutes(new Date(iso), 'Africa/Casablanca')).toBe(0);
      expect(seasonPlanOffsetMinutes(new Date(iso), 'Africa/Casablanca')).toBe(0);
    }
  });
});

// The Meal Plan is drawn per IATA season (ROV 4.5.10.2–3): a clock change mid-season doesn't move it.
describe('IATA seasons', () => {
  const at = (iso: string) => new Date(iataSeasonStart(new Date(iso))).toISOString();

  it('starts on the last Sunday of March and of October', () => {
    expect(at('2026-09-21T10:45:00Z')).toBe('2026-03-29T01:00:00.000Z');
    expect(at('2026-10-25T01:00:00Z')).toBe('2026-10-25T01:00:00.000Z');
    expect(at('2026-10-25T00:59:00Z')).toBe('2026-03-29T01:00:00.000Z');
    expect(at('2027-01-10T12:00:00Z')).toBe('2026-10-25T01:00:00.000Z');
    expect(at('2027-03-28T02:00:00Z')).toBe('2027-03-28T01:00:00.000Z');
    expect(at('2028-10-29T12:00:00Z')).toBe('2028-10-29T01:00:00.000Z');
  });

  it('keeps the season start clock: Morocco plans on UTC+1 until 25 Oct 2026, UTC+0 after', () => {
    expect(seasonPlanOffsetMinutes(new Date('2026-09-21T10:45:00Z'), 'Africa/Casablanca')).toBe(60);
    expect(seasonPlanOffsetMinutes(new Date('2026-11-02T10:45:00Z'), 'Africa/Casablanca')).toBe(0);
    expect(seasonPlanOffsetMinutes(new Date('2027-07-01T10:45:00Z'), 'Africa/Casablanca')).toBe(0);
  });

  it('matches the real clock where clocks change with the seasons', () => {
    for (const iso of ['2026-04-01T12:00:00Z', '2026-10-24T12:00:00Z', '2026-10-26T12:00:00Z', '2027-03-27T12:00:00Z']) {
      for (const tz of ['Europe/Lisbon', 'Europe/Madrid', 'Europe/London', 'Atlantic/Azores', 'Atlantic/Cape_Verde']) {
        const d = new Date(iso);
        expect(seasonPlanOffsetMinutes(d, tz)).toBe(tzOffsetMinutes(d, tz));
      }
    }
  });
});
