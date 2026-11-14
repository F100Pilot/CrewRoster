import { describe, it, expect } from 'vitest';
import {
  parseCrewInfo, parseGroundCrewInfo, attachCrewToDuties, attachGroundCrewToDuties,
  sortCrew, placeSafetyMarks, placeTrainees, type CrewLeg,
} from '../parsing/pdf/crewInfo';
import { isInstructorFlight } from '../domain/payEstimate';
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

  // A wrapped crew first-name fragment can be a 3-letter uppercase token (e.g. "RUI") sitting in
  // the identity column below the crew list. It must NOT be read as the arrival airport (which
  // would then fail to match the flight's real route and drop the crew).
  it('does not mistake a 3-letter crew name fragment below the crew for the arrival airport', () => {
    const X = 200;
    const legs = parseCrewInfo([
      tok('cockpit:', X, 515),
      tok('Mon05', X, 535), tok('TP', X, 504), tok('100', X, 489),
      tok('LIS', X, 470), tok('0800', X, 455), tok('0930', X, 440), tok('AGP', X, 425), // route
      tok('HOLDER, HOLDER, PU', X, 410), // a crew member in the identity column
      tok('RUI', X, 395), // a wrapped first-name fragment BELOW the crew — not an airport
    ]);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ flightNumber: 'TP100', dep: 'LIS', arr: 'AGP' });
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
});

// The "Crew Information on Ground Activity" section is a TRANSPOSED grid (like the flight "on
// Leg" one), modelled here on the real PDF geometry: each activity is a column with the date on
// top, then the code, the crew just to the LEFT of and below the code, then location and
// begin/end below. pdf.js emits the crew prefix as a bare "event:" token. Fake names only.
function groundTokens(code = 'E90-FRA-1', colX = 465, date = 'Fri03'): PositionedToken[] {
  return [
    tok(date, colX, 802), // date on top of the column
    tok(code, colX, 770), // the activity code
    tok('event:AALPHA, ALPHA, CP ANA', colX - 6, 751), // crew just left of / below the code
    tok('BBRAVO, BRAVO, FO BRUNO', colX - 12, 729),
    tok('CCHARLIE, CHARLIE, CP CARLOS', colX - 18, 729),
    tok('FRA', colX, 707), // location, below the crew
    tok('1700', colX, 660), tok('2100', colX, 625), // begin / end
  ];
}

describe('parseGroundCrewInfo', () => {
  it('extracts a simulator activity with its crew (transposed column)', () => {
    const legs = parseGroundCrewInfo(groundTokens());
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ dow: 'Fri03', code: 'E90-FRA-1', location: 'FRA', begin: '17:00', end: '21:00' });
    expect(legs[0].crew.map((c) => `${c.login}(${c.role})`).sort()).toEqual(
      ['AALPHA(CP)', 'BBRAVO(FO)', 'CCHARLIE(CP)'],
    );
    expect(legs[0].crew.find((c) => c.login === 'AALPHA')?.firstName).toBe('ANA');
  });

  it('parses crew even when the "event:" prefix is absent (keys off the code)', () => {
    const noPrefix = groundTokens().map((t) => ({ ...t, text: t.text.replace(/^event:/i, '') }));
    const legs = parseGroundCrewInfo(noPrefix);
    expect(legs[0].crew.map((c) => c.login).sort()).toEqual(['AALPHA', 'BBRAVO', 'CCHARLIE']);
  });

  it('ignores a bare code with no crew in its column (e.g. the duty-grid copy)', () => {
    const gridOnly = [tok('Fri03', 465, 802), tok('E90-FRA-1', 465, 770)];
    expect(parseGroundCrewInfo(gridOnly)).toHaveLength(0);
  });

  it('de-duplicates repeated grid copies, merging crew', () => {
    expect(parseGroundCrewInfo([...groundTokens(), ...groundTokens()])).toHaveLength(1);
  });

  it('keeps two adjacent activity columns apart, without bleeding crew across them', () => {
    // Two columns ~33px apart, each E90-FRA-1 on a different date with its own crew.
    const a = groundTokens('E90-FRA-1', 465, 'Fri03');
    const b: PositionedToken[] = [
      tok('Sat04', 432, 802), tok('E90-FRA-1', 432, 770),
      tok('event:XSOLO, SOLO, CP SOLO', 432 - 6, 751),
      tok('FRA', 432, 707), tok('1700', 432, 660), tok('2100', 432, 625),
    ];
    const legs = parseGroundCrewInfo([...a, ...b]);
    expect(legs.map((l) => l.dow).sort()).toEqual(['Fri03', 'Sat04']);
    expect(legs.find((l) => l.dow === 'Sat04')?.crew.map((c) => c.login)).toEqual(['XSOLO']);
    expect(legs.find((l) => l.dow === 'Fri03')?.crew.map((c) => c.login).sort()).toEqual(['AALPHA', 'BBRAVO', 'CCHARLIE']);
  });
});

describe('attachGroundCrewToDuties', () => {
  const sim = (over: Partial<ParsedDuty> = {}): ParsedDuty => ({
    date: '2026-07-03', dutyCode: 'E90-FRA-1', dutyType: 'Simulator', reportingTime: null,
    departureTime: '17:00', arrivalTime: '21:00', flightNumber: null,
    departureAirport: 'FRA', arrivalAirport: null, aircraftType: null, observations: null, ...over,
  });

  it('attaches the simulator crew by weekday+day and code', () => {
    const duties = [sim()]; // 2026-07-03 is a Friday → "Fri03"
    attachGroundCrewToDuties(duties, parseGroundCrewInfo(groundTokens()));
    expect(duties[0].crew?.map((c) => c.login)).toEqual(['AALPHA', 'CCHARLIE', 'BBRAVO']); // CP, CP, FO → sorted
  });

  it('fills Início/Fim and airport from the Ground Activity row when the duty lacks them', () => {
    const duties = [sim({ departureTime: null, arrivalTime: null, departureAirport: null })];
    attachGroundCrewToDuties(duties, parseGroundCrewInfo(groundTokens()));
    expect(duties[0]).toMatchObject({ departureTime: '17:00', arrivalTime: '21:00', departureAirport: 'FRA' });
  });

  it('does not attach to a different date or code', () => {
    const other = [sim({ date: '2026-07-10' }), sim({ dutyCode: 'E90-VIE-1' })];
    attachGroundCrewToDuties(other, parseGroundCrewInfo(groundTokens()));
    expect(other[0].crew).toBeUndefined();
    expect(other[1].crew).toBeUndefined();
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

// A real November roster (names replaced): an overnight AGP stay, then the return AGP→LIS flown by
// the same two pilots, then LIS–MAD–LIS with a first officer in line training (printed without a
// rank, "CLTC" beside the flight) and the overnight FO as FO_SAFETY. The crew section lists only
// the first leg of each crew: Sun22 TP9691 and Mon23 TP9020.
describe('crew carried forward, line training given (CLTC) and FO_SAFETY', () => {
  const leg = (date: string, fn: string, a: string, z: string, off: string, on: string, obs: string | null = null): ParsedDuty => ({
    date, dutyCode: 'FLT', dutyType: 'Flight Duty', reportingTime: null, departureTime: off, arrivalTime: on,
    flightNumber: fn, departureAirport: a, arrivalAirport: z, aircraftType: 'E90', observations: obs,
  });
  const cp = { login: 'PCAPT', surname: 'CAPT', role: 'CP' };
  const fo = { login: 'PFIRST', surname: 'FIRST', role: 'FO' };
  const trainee = { login: 'PTRAIN', surname: 'TRAIN', role: 'FO' };
  const pu = { login: 'PPURS', surname: 'PURS', role: 'PU' };
  const duties = () => [
    leg('2026-11-22', 'TP9691', 'LIS', 'FNC', '15:20', '17:10'),
    leg('2026-11-22', 'TP9692', 'FNC', 'LIS', '18:10', '19:55'),
    leg('2026-11-22', 'TP9138', 'LIS', 'AGP', '21:00', '22:15'),
    leg('2026-11-23', 'TP9137', 'AGP', 'LIS', '14:00', '15:25', 'FO_SAFETY'),
    leg('2026-11-23', 'TP9020', 'LIS', 'MAD', '18:00', '19:20', 'CLTC'),
    leg('2026-11-23', 'TP9021', 'MAD', 'LIS', '20:10', '21:35', 'CLTC'),
  ];
  const legs: CrewLeg[] = [
    { dow: 'Sun22', flightNumber: 'TP9691', dep: 'LIS', arr: 'FNC', crew: [cp, fo, pu] },
    { dow: 'Mon23', flightNumber: 'TP9020', dep: 'LIS', arr: 'MAD', crew: [cp, trainee, fo, pu] },
  ];

  it('an unlisted leg is flown by the crew that came before it, not by a later entry', () => {
    const d = duties();
    attachCrewToDuties(d, legs);
    const logins = (fn: string) => d.find((x) => x.flightNumber === fn)!.crew!.map((c) => c.login);
    expect(logins('TP9137')).not.toContain('PTRAIN');
    expect(logins('TP9137')).toContain('PFIRST');
    expect(logins('TP9021')).toContain('PTRAIN');
  });

  it('FO_SAFETY moves to the legs flown with two first officers', () => {
    const d = duties();
    attachCrewToDuties(d, legs);
    placeSafetyMarks(d);
    const obs = (fn: string) => d.find((x) => x.flightNumber === fn)!.observations;
    expect(obs('TP9137')).toBeNull();
    expect(obs('TP9020')).toBe('CLTC, FO_SAFETY');
    expect(obs('TP9021')).toBe('CLTC, FO_SAFETY');
  });

  // User rule: the crew isn't simply the previous flight's — the FO beside CLTC/CTRI is the one
  // who joins, from his first marked leg.
  const marked = () => duties().map((d) => (d.observations?.includes('CLTC') ? { ...d, trainee: 'PTRAIN' } : d));

  it('the FO beside CLTC joins at his first marked leg, never on the day\'s earlier legs', () => {
    const d = marked();
    // Even when the crew section gives the morning leg the whole crew, trainee included.
    attachCrewToDuties(d, [...legs, { dow: 'Mon23', flightNumber: 'TP9137', dep: 'AGP', arr: 'LIS', crew: [cp, trainee, fo, pu] }]);
    placeTrainees(d);
    placeSafetyMarks(d);
    const logins = (fn: string) => d.find((x) => x.flightNumber === fn)!.crew!.map((c) => c.login);
    expect(logins('TP9137')).toEqual(['PCAPT', 'PFIRST', 'PPURS']);
    expect(logins('TP9020')).toContain('PTRAIN');
    expect(logins('TP9021')).toContain('PTRAIN');
    expect(d.find((x) => x.flightNumber === 'TP9137')!.observations).toBeNull();
    expect(d.find((x) => x.flightNumber === 'TP9021')!.observations).toBe('CLTC, FO_SAFETY');
  });

  it('a marked leg whose crew lacks the trainee gets him, as an FO', () => {
    const d = marked();
    attachCrewToDuties(d, [legs[0]]); // no entry with him: the overnight crew is carried all day
    placeTrainees(d);
    const crew = (fn: string) => d.find((x) => x.flightNumber === fn)!.crew!;
    expect(crew('TP9020').find((c) => c.login === 'PTRAIN')).toMatchObject({ surname: 'PTRAIN', role: 'FO' });
    expect(crew('TP9021').filter((c) => c.role === 'FO')).toHaveLength(2);
    expect(crew('TP9137').map((c) => c.login)).not.toContain('PTRAIN');
  });

  it('CLTC / CTRI is line training given: the day pays as one', () => {
    expect(isInstructorFlight(leg('2026-11-23', 'TP9020', 'LIS', 'MAD', '18:00', '19:20', 'CLTC, FO_SAFETY'))).toBe(true);
    expect(isInstructorFlight(leg('2026-11-23', 'TP9020', 'LIS', 'MAD', '18:00', '19:20', 'CTRI'))).toBe(true);
    expect(isInstructorFlight(leg('2026-11-23', 'TP9137', 'AGP', 'LIS', '14:00', '15:25', 'FO_SAFETY'))).toBe(false);
  });
});
