import { describe, it, expect } from 'vitest';
import { parseCrewInfo, attachCrewToDuties, reattachCrew, sortCrew } from '../parsing/pdf/crewInfo';
import type { PositionedToken } from '../parsing/pdf/extractText';
import type { ParsedDuty } from '../domain/types';

// Build a tiny "Crew Information on Leg" column modelled on the real PDF geometry (page >= 6):
// the identity stacked vertically, crew in the columns just to its left. Fake names only.
function tok(text: string, x: number, y: number): PositionedToken {
  return { text, x, y, width: 10, height: 6, page: 6 };
}

function legTokens(): PositionedToken[] {
  const X = 200; // identity column
  return [
    tok('cockpit:',X, 515), // marks the flight-crew zone the parser anchors on
    tok('Mon05', X, 535), tok('TP', X, 504), tok('100', X, 489),
    tok('LIS', X, 428), tok('0800', X, 401), tok('0930', X, 364), tok('OPO', X, 331),
    // crew in the two columns to the left
    tok('AAA, ALPHA, CP', X - 20, 480),
    tok('BBB, BRAVO, FO', X - 20, 455),
    tok('CCC, CHARLIE, PU', X - 30, 480),
    tok('DDD, DELTA, ST', X - 30, 455),
    // a stray wrapped first-name fragment (must be ignored)
    tok('JOAO', X - 30, 430),
  ];
}

describe('parseCrewInfo', () => {
  it('extracts a leg with its crew, ignoring wrapped first-name fragments', () => {
    const legs = parseCrewInfo(legTokens());
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ dow: 'Mon05', flightNumber: 'TP100', dep: 'LIS', arr: 'OPO' });
    expect(legs[0].crew.map((c) => `${c.surname}(${c.role})`).sort()).toEqual(
      ['ALPHA(CP)', 'BRAVO(FO)', 'CHARLIE(PU)', 'DELTA(ST)'],
    );
  });

  it('keeps the first name when present in the token', () => {
    const legs = parseCrewInfo([
      tok('cockpit:',200, 515),
      tok('Mon05', 200, 535), tok('TP', 200, 504), tok('100', 200, 489), tok('LIS', 200, 428), tok('OPO', 200, 331),
      tok('XBARROS, BARROS, FO FILIPE', 180, 480),
    ]);
    expect(legs[0].crew[0]).toMatchObject({ login: 'XBARROS', surname: 'BARROS', role: 'FO', firstName: 'FILIPE' });
  });

  it('de-duplicates repeated grid copies, merging crew', () => {
    const legs = parseCrewInfo([...legTokens(), ...legTokens()]);
    expect(legs).toHaveLength(1);
    expect(legs[0].crew).toHaveLength(4);
  });

  // The "cockpit:"/"cabin:" section-holder tokens are real crew members (e.g. the Captain on a
  // cabin-crew member's roster). Empty labels are ignored; named ones are captured.
  it('captures the cockpit: section holder, ignoring an empty cabin: label', () => {
    const X = 200;
    const legs = parseCrewInfo([
      tok('cockpit: CHIEF, CHIEF, CP', X, 515), // a real crew member (the Captain)
      tok('cabin:', X - 12, 515), // empty label → ignored
      tok('Mon05', X, 535), tok('TP', X, 504), tok('100', X, 489), tok('LIS', X, 428), tok('OPO', X, 331),
      tok('AAA, ALPHA, FO', X - 20, 480),
      tok('BBB, BRAVO, PU', X - 26, 480),
    ]);
    expect(legs[0].crew.map((c) => `${c.login}(${c.role})`).sort()).toEqual(
      ['AAA(FO)', 'BBB(PU)', 'CHIEF(CP)'],
    );
  });

  // The PDF clips the role off a crew token when a leg carries two same-rank pilots; the
  // role is then inferred from the column position (cabin left, purser, cockpit right).
  it('infers a clipped PU when two same-rank pilots and no purser are present', () => {
    const X = 200;
    const legs = parseCrewInfo([
      tok('cockpit:',X, 515),
      tok('Mon05', X, 535), tok('TP', X, 504), tok('100', X, 489), tok('LIS', X, 428), tok('OPO', X, 331),
      tok('AAA, ALPHA, ST', X - 28, 480),
      tok('BBB, BRAVO, ST', X - 22, 480),
      tok('CCC, CHARLIE,', X - 16, 480), // role clipped → sits just left of the cockpit → PU
      tok('DDD, DELTA, FO', X - 10, 480),
      tok('EEE, ECHO, FO', X - 4, 480),
    ]);
    expect(legs[0].crew.find((c) => c.login === 'CCC')?.role).toBe('PU');
  });

  // Real layout seen on a leg with a single rostered pilot: ST, ST, <clipped>, FO.
  it('infers the PU on a single-pilot cabin layout (ST ST ? FO)', () => {
    const X = 200;
    const legs = parseCrewInfo([
      tok('cockpit:',X, 515),
      tok('Mon05', X, 535), tok('TP', X, 504), tok('100', X, 489), tok('LIS', X, 428), tok('AGP', X, 331),
      tok('AAA, ALPHA, ST', X - 26, 480),
      tok('BBB, BRAVO, ST', X - 20, 480),
      tok('CCC, CHARLIE,', X - 14, 480), // role clipped → just left of the lone pilot → PU
      tok('DDD, DELTA, FO', X - 8, 480),
    ]);
    expect(legs[0].crew.find((c) => c.login === 'CCC')?.role).toBe('PU');
  });

  it('infers a clipped role as steward when a purser is already present', () => {
    const X = 200;
    const legs = parseCrewInfo([
      tok('cockpit:',X, 515),
      tok('Mon05', X, 535), tok('TP', X, 504), tok('100', X, 489), tok('LIS', X, 428), tok('OPO', X, 331),
      tok('AAA, ALPHA, ST', X - 22, 480),
      tok('CCC, CHARLIE,', X - 16, 480), // role clipped, but a PU already sits to its right → ST
      tok('PPP, PURSER, PU', X - 10, 480),
      tok('DDD, DELTA, FO', X - 4, 480),
    ]);
    expect(legs[0].crew.find((c) => c.login === 'CCC')?.role).toBe('ST');
  });
});

describe('attachCrewToDuties', () => {
  const flight = (over: Partial<ParsedDuty>): ParsedDuty => ({
    date: '2026-01-05', dutyCode: 'FLT', dutyType: 'Flight Duty', reportingTime: null,
    departureTime: '08:00', arrivalTime: '09:30', flightNumber: 'TP100',
    departureAirport: 'LIS', arrivalAirport: 'OPO', aircraftType: 'E90', observations: null, ...over,
  });

  it('matches a leg to the flight by weekday+day, flight number and departure', () => {
    // 2026-01-05 is a Monday → "Mon05", matching the leg.
    const duties = [flight({})];
    attachCrewToDuties(duties, parseCrewInfo(legTokens()));
    expect(duties[0].crew?.map((c) => c.surname)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA']);
  });

  it('does not attach to the same flight number on a different date', () => {
    const duties = [flight({ date: '2026-01-12' })]; // a Monday too, but the 12th, not the 5th
    attachCrewToDuties(duties, parseCrewInfo(legTokens()));
    expect(duties[0].crew).toBeUndefined();
  });

  it('propagates the crew to the return leg of a same-day rotation', () => {
    // Outbound LIS→OPO has a crew leg; the same-day return OPO→LIS has none of its own and
    // should inherit it (same airframe → same crew).
    const outbound = flight({ flightNumber: 'TP100', departureAirport: 'LIS', arrivalAirport: 'OPO', departureTime: '08:00', arrivalTime: '09:00' });
    const ret = flight({ flightNumber: 'TP101', departureAirport: 'OPO', arrivalAirport: 'LIS', departureTime: '10:00', arrivalTime: '11:00' });
    const duties = [outbound, ret];
    attachCrewToDuties(duties, parseCrewInfo(legTokens()));
    expect(outbound.crew?.map((c) => c.surname)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA']);
    expect(ret.crew?.map((c) => c.surname)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA']); // inherited
  });

  it('propagates the crew to an overnight return on the NEXT day', () => {
    // Fly out LIS→OPO on the 5th (crew listed), sleep over, fly back OPO→LIS on the 6th with no
    // Crew Information entry of its own → it must inherit the outbound's crew across the day.
    const outbound = flight({ date: '2026-01-05', flightNumber: 'TP100', departureAirport: 'LIS', arrivalAirport: 'OPO', departureTime: '08:00', arrivalTime: '09:00' });
    const ret = flight({ date: '2026-01-06', flightNumber: 'TP200', departureAirport: 'OPO', arrivalAirport: 'LIS', departureTime: '10:00', arrivalTime: '11:00' });
    attachCrewToDuties([outbound, ret], parseCrewInfo(legTokens()));
    expect(ret.crew?.map((c) => c.surname)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA']);
  });

  it('does NOT propagate across an implausibly long gap (different trip)', () => {
    // A return that departs the same airport but a week later is a different pairing.
    const outbound = flight({ date: '2026-01-05', flightNumber: 'TP100', departureAirport: 'LIS', arrivalAirport: 'OPO', departureTime: '08:00', arrivalTime: '09:00' });
    const later = flight({ date: '2026-01-12', flightNumber: 'TP300', departureAirport: 'OPO', arrivalAirport: 'LIS', departureTime: '10:00', arrivalTime: '11:00' });
    attachCrewToDuties([outbound, later], parseCrewInfo(legTokens()));
    expect(later.crew).toBeUndefined();
  });

  it('does NOT overwrite a leg that has its own (changed) crew', () => {
    const outbound = flight({ flightNumber: 'TP100', arrivalAirport: 'OPO', departureTime: '08:00', arrivalTime: '09:00' });
    const ret = flight({ flightNumber: 'TP101', departureAirport: 'OPO', arrivalAirport: 'LIS', departureTime: '10:00', arrivalTime: '11:00', crew: [{ login: 'OWN', surname: 'OWN', role: 'CP' }] });
    attachCrewToDuties([outbound, ret], parseCrewInfo(legTokens()));
    expect(ret.crew?.map((c) => c.login)).toEqual(['OWN']); // its own crew is kept
  });

  // reattachCrew is used to re-derive crew for a roster imported by an older parser: it must
  // wipe whatever (possibly stale) crew the duties carry and rebuild it from the legs.
  it('reattachCrew clears stale crew and re-derives from the legs', () => {
    const outbound = flight({ flightNumber: 'TP100', departureAirport: 'LIS', arrivalAirport: 'OPO', departureTime: '08:00', arrivalTime: '09:00', crew: [{ login: 'OLD', surname: 'OLD', role: 'CP' }] });
    const ret = flight({ flightNumber: 'TP101', departureAirport: 'OPO', arrivalAirport: 'LIS', departureTime: '10:00', arrivalTime: '11:00', crew: [{ login: 'STALE', surname: 'STALE', role: 'CP' }] });
    reattachCrew([outbound, ret], parseCrewInfo(legTokens()));
    expect(outbound.crew?.map((c) => c.surname)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA']);
    expect(ret.crew?.map((c) => c.surname)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA']); // refreshed via rotation, not the stale crew
  });
});

describe('sortCrew', () => {
  it('orders cockpit (CP, FO) before cabin (PU, ST), then by surname', () => {
    const sorted = sortCrew([
      { login: 'a', surname: 'ZULU', role: 'ST' },
      { login: 'b', surname: 'ALPHA', role: 'FO' },
      { login: 'c', surname: 'BETA', role: 'CP' },
      { login: 'd', surname: 'MIKE', role: 'PU' },
    ]);
    expect(sorted.map((c) => c.role)).toEqual(['CP', 'FO', 'PU', 'ST']);
  });
});
