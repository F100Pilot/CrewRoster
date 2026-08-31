// Parser for the PDF's "Crew Information on Leg" section (the crew rostered on each flight,
// printed after the duty grid). Like the duty plan, it's a dense TRANSPOSED grid: each leg
// is a column whose identity (date, carrier, flight number, route, times) is stacked
// vertically, with the cabin crew listed in the narrow columns to its left and the cockpit
// holder inside the identity column. Overlapping grid copies repeat, so we de-duplicate.
//
// Each crew member is one token like "FBARROS, BARROS, FO FILIPE" (login, surname, role,
// optional first name). The login/surname/role live in a single token; stray first-name
// fragments that wrap onto their own line are ignored.
import { format, parseISO } from 'date-fns';
import type { CrewMember, ParsedDuty } from '../../domain/types';
import type { PositionedToken } from './extractText';
import { operatedFlights } from '../../domain/flightTime';
import { rotationChains } from '../../domain/aircraftRegs';

// Bumped whenever the crew parser changes in a way that should re-derive crew for ALREADY
// imported rosters (the app re-runs the parser on the stored PDF when a roster's stamp is
// behind this — see refreshCrewFromPdfs). 1 = role required; 2 = optional role + inference;
// 3 = crew on ground activities (simulator); 4 = + begin/end/location for ground activities;
// 5 = ground-activity section parsed as a transposed grid (event: prefix, column geometry);
// 6 = route airports read above the crew list (a name fragment is no longer taken as the arrival);
// 7 = new simulator codes (LIS-EBT-1/-2, LIS-OTHER) recognised as ground activities.
export const CREW_PARSER_VERSION = 7;

const DOW = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\d{2}$/;
const NUM = /^\d{2,4}$/;
const AIRPORT = /^[A-Z]{3}$/;
// A crew token: LOGIN, SURNAME, [ROLE] [FIRST NAME]. Allow an optional space after the
// first comma (the PDF is inconsistent: "GROVISCO, ROVISCO, CP" vs "JRIBEIRO,RIBEIRO, CP").
// The ROLE is OPTIONAL: when a leg carries two pilots of the same rank the PDF sometimes
// clips the role off a token (e.g. "LUIS, ALVES," with no "PU"), so we still accept it and
// infer the role afterwards from the crew member's position in the column (see inferRoles).
const CREW = /^([A-Za-z]+),\s*([A-Za-z]+),\s*(CP|FO|PU|ST)?\s*([A-Za-z].*)?$/i;
// Each leg's column also carries section-holder tokens prefixed with "cockpit:" / "cabin:"
// (e.g. "cockpit: RCLARO, CLARO, CP") — a real crew member that must be captured too. For a
// pilot's roster the cockpit holder is the owner; for a cabin-crew roster it's the Captain, so
// dropping it lost a commander. The ground-activity section prefixes its crew with
// "crew on event:" — which pdf.js often emits as a bare "event:" token, the "crew on " having
// been split off onto the label line above. We strip whichever prefix and parse the rest.
const SECTION_PREFIX = /^(?:cockpit|cabin|(?:crew on )?event):\s*/i;
const crewBody = (text: string) => text.replace(SECTION_PREFIX, '');

export interface CrewLeg {
  dow: string; // weekday+day-of-month, e.g. "Thu15"
  flightNumber: string; // e.g. "TP1438"
  dep: string | null;
  arr: string | null;
  crew: CrewMember[];
}

// A crew member while still positioned in the grid: we keep its x so missing roles can be
// inferred from where it sits in the column (cabin on the left, cockpit on the right).
interface PositionedCrew extends CrewMember { x: number }

function parseCrewToken(text: string): CrewMember | null {
  const m = crewBody(text).match(CREW);
  if (!m) return null;
  const firstName = (m[4] ?? '').trim().replace(/\s+/g, ' ') || undefined;
  return { login: m[1].toUpperCase(), surname: m[2].toUpperCase(), role: (m[3] ?? '').toUpperCase(), firstName };
}

// Fill in roles that were clipped off in the PDF, using each member's x within the column.
// Crew are printed left→right as: cabin (ST…) then the purser (PU) then the cockpit (FO/CP).
// So the cockpit is the rightmost contiguous CP/FO block; a role-less member sitting just to
// its left, when the leg has no purser yet, is the Chefe de Cabine (PU). Anything else
// role-less is a cabin steward (ST).
function inferRoles(crew: PositionedCrew[]): void {
  if (crew.every((c) => c.role)) return;
  const byX = [...crew].sort((a, b) => a.x - b.x);
  let cockpitStart = byX.length;
  for (let i = byX.length - 1; i >= 0; i--) {
    if (byX[i].role === 'CP' || byX[i].role === 'FO') cockpitStart = i;
    else break;
  }
  const hasPurser = byX.some((c) => c.role === 'PU');
  for (let i = 0; i < byX.length; i++) {
    if (byX[i].role) continue;
    byX[i].role = !hasPurser && i === cockpitStart - 1 ? 'PU' : 'ST';
  }
}

// Extract every leg (with its crew) from the crew-information section of a duty-plan PDF.
export function parseCrewInfo(tokens: PositionedToken[]): CrewLeg[] {
  // Anchor on the FLIGHT crew zone, which is the part of the PDF that carries "cockpit:"
  // labels: the main duty grid has none, and the simulator/office crew zones have no flight
  // carrier (so the carrier-anchoring below also excludes those). This works regardless of
  // the section's title or page — a short date-range export lays it out differently from
  // the full-year one, and its header may read "Crew Information on" without "Leg".
  const cockpitPages = tokens.filter((z) => /^cockpit:/i.test(z.text)).map((z) => z.page);
  if (cockpitPages.length === 0) return [];
  const startPage = Math.min(...cockpitPages);

  const legs: (Omit<CrewLeg, 'crew'> & { page: number; x: number; dowY: number; crew: PositionedCrew[] })[] = [];

  // Anchor on each carrier token ("TP") at/after the crew-section header.
  for (const tp of tokens.filter((z) => z.text === 'TP' && z.page >= startPage)) {
    const col = tokens
      .filter((z) => z.page === tp.page && Math.abs(z.x - tp.x) <= 4 && z.text.trim())
      .sort((a, b) => b.y - a.y); // top → bottom
    const i = col.indexOf(tp);
    const num = col.slice(i + 1).find((z) => NUM.test(z.text) && !DOW.test(z.text));
    if (!num) continue;

    // Fields sit in the same tight column below the number, down to the next leg boundary
    // (the next DOW or carrier). Reading only this column avoids picking up airports/times
    // that bleed in from overlapping tables.
    const after = col.filter((z) => z.y < num.y);
    const boundary = after.find((z) => DOW.test(z.text) || z.text === 'TP');
    const seg = boundary ? after.filter((z) => z.y > boundary.y) : after;
    // The route airports (departure, arrival) sit at the TOP of the column, above the leg's
    // crew list. A wrapped crew first-name fragment can be a 3-letter uppercase token (e.g.
    // "RUI") and would otherwise be mistaken for the arrival airport, so only read airports
    // ABOVE the first crew/section-holder token (higher y = higher on the page).
    const crewTopY = seg
      .filter((z) => SECTION_PREFIX.test(z.text) || CREW.test(crewBody(z.text)))
      .reduce((m, z) => Math.max(m, z.y), -Infinity);
    const routeSeg = crewTopY > -Infinity ? seg.filter((z) => z.y > crewTopY) : seg;
    const airports = routeSeg.filter((z) => AIRPORT.test(z.text));

    // The date sits just above the carrier (a bit wider in x).
    const dowTok = tokens
      .filter((z) => z.page === tp.page && Math.abs(z.x - tp.x) <= 10 && z.y > tp.y && z.y < tp.y + 48 && DOW.test(z.text))
      .sort((a, b) => a.y - b.y)[0];
    if (!dowTok) continue; // can't place the leg without a date — skip

    legs.push({
      page: tp.page, x: tp.x, dowY: dowTok.y,
      dow: dowTok.text,
      flightNumber: `${tp.text}${num.text}`,
      dep: airports[0]?.text ?? null,
      arr: airports.length > 1 ? airports[airports.length - 1].text : null,
      crew: [],
    });
  }

  // Assign each crew token to the nearest leg whose identity column is just to its RIGHT
  // (crew sit in the columns left of the identity), within the same vertical band.
  for (const ct of tokens.filter((z) => z.page >= startPage && CREW.test(crewBody(z.text)))) {
    const member = parseCrewToken(ct.text);
    if (!member) continue;
    let best: (typeof legs)[number] | null = null;
    let bestDx = Infinity;
    for (const leg of legs) {
      if (leg.page !== ct.page) continue;
      const dx = leg.x - ct.x;
      if (dx >= -4 && dx < 42 && ct.y < leg.dowY + 4 && ct.y > leg.dowY - 210 && dx < bestDx) {
        bestDx = dx; best = leg;
      }
    }
    if (best && !best.crew.some((c) => c.login === member.login)) best.crew.push({ ...member, x: ct.x });
  }

  // De-duplicate overlapping grid copies: merge legs with the same date+flight+route,
  // keeping the union of crew (still positioned, so roles can be inferred from the full set).
  const byKey = new Map<string, (typeof legs)[number]>();
  for (const leg of legs) {
    const key = `${leg.dow}|${leg.flightNumber}|${leg.dep ?? ''}-${leg.arr ?? ''}`;
    const existing = byKey.get(key);
    if (existing) {
      for (const m of leg.crew) if (!existing.crew.some((c) => c.login === m.login)) existing.crew.push(m);
    } else {
      byKey.set(key, { ...leg, crew: [...leg.crew] });
    }
  }

  // Now that each leg has its complete crew, fill in any clipped roles, then drop the
  // internal x position and any leg that ended up with no crew.
  const out: CrewLeg[] = [];
  for (const leg of byKey.values()) {
    if (leg.crew.length === 0) continue;
    inferRoles(leg.crew);
    out.push({
      dow: leg.dow, flightNumber: leg.flightNumber, dep: leg.dep, arr: leg.arr,
      crew: leg.crew.map(({ x: _x, ...c }) => c),
    });
  }
  return out;
}

// ── Ground activities (simulator) ───────────────────────────────────────────────────────────
// The PDF's "Crew Information on Ground Activity" section — the crew rostered on a simulator
// session — is a plain, NON-transposed table (unlike the flight "on Leg" grid): each row is an
// activity "date  code  location  begin  end" (e.g. "Fri03  E90-FRA-1  FRA  1700  2100"), with
// the crew listed just below on "crew on event:" lines. There is no carrier/flight number, so
// the activity is identified by its date + code — the same code the duty grid stores as the
// Simulator duty's dutyCode (see classifyDuty: E90-VIE-1 style).
// Simulator/ground activity codes: the original E90-FRA-1 shape and, from Sep 2026, the
// base-prefixed LIS-EBT-1 / LIS-EBT-2 / LIS-OTHER used by the Lisbon simulator.
const GROUND_CODE = /^(E\d{2}-[A-Z]{3}-\d|[A-Z]{3}-(EBT-\d|OTHER))$/;
const HHMM = /^([01]\d|2[0-3])[0-5]\d$/; // 1700, 2100 → begin/end columns

export interface GroundCrewLeg {
  dow: string; // "Fri03"
  code: string; // "E90-FRA-1"
  location: string | null; // "FRA"
  begin: string | null; // "17:00"
  end: string | null; // "21:00"
  crew: CrewMember[];
}

const hhmm = (t: string) => `${t.slice(0, 2)}:${t.slice(2)}`;

export function parseGroundCrewInfo(tokens: PositionedToken[]): GroundCrewLeg[] {
  // The "Crew Information on Ground Activity" section is a TRANSPOSED grid, like the flight "on
  // Leg" one: each activity is a COLUMN whose identity is stacked vertically — the date on top,
  // then the code (E90-FRA-1), then the crew, then the location and begin/end times — with the
  // crew tokens in the narrow columns just to the LEFT of the code. Overlapping grid copies
  // repeat, so we de-duplicate. We anchor on the code; a duty-grid copy of the code with no crew
  // in its column simply yields an empty activity that's dropped at the end.
  type Act = Omit<GroundCrewLeg, 'crew'> & { x: number; y: number; page: number; crew: CrewMember[] };
  const acts: Act[] = [];
  for (const code of tokens.filter((z) => GROUND_CODE.test(z.text))) {
    // The date sits just above the code in the same column.
    const dow = tokens
      .filter((z) => z.page === code.page && Math.abs(z.x - code.x) <= 12 && z.y > code.y && z.y < code.y + 52 && DOW.test(z.text))
      .sort((a, b) => a.y - b.y)[0];
    if (!dow) continue;
    // Location and begin/end sit below the code in the same column.
    const colBelow = tokens.filter((z) => z.page === code.page && Math.abs(z.x - code.x) <= 12 && z.y < code.y && z.y > code.y - 170);
    const location = colBelow.filter((z) => AIRPORT.test(z.text)).sort((a, b) => b.y - a.y)[0]?.text ?? null;
    const clock = colBelow.filter((z) => HHMM.test(z.text)).sort((a, b) => b.y - a.y);
    acts.push({
      dow: dow.text, code: code.text, x: code.x, y: code.y, page: code.page,
      location,
      begin: clock[0] ? hhmm(clock[0].text) : null,
      end: clock[1] ? hhmm(clock[1].text) : null,
      crew: [],
    });
  }
  if (acts.length === 0) return [];

  // Assign each crew token to the code column immediately to its RIGHT (crew sit just left of the
  // identity), below the code. The dx window is tight (< 22) so a token binds only to its OWN
  // column — adjacent activity columns are ~33px apart, so this never bleeds across them.
  for (const ct of tokens.filter((z) => CREW.test(crewBody(z.text)))) {
    const member = parseCrewToken(ct.text);
    if (!member) continue;
    let best: (typeof acts)[number] | null = null;
    let bestDx = Infinity;
    for (const a of acts) {
      if (a.page !== ct.page) continue;
      const dx = a.x - ct.x; // positive when the code sits to the right of the crew token
      const dy = a.y - ct.y; // positive when the crew sits below the code
      if (dx >= -4 && dx < 22 && dy > 0 && dy < 110 && dx < bestDx) { bestDx = dx; best = a; }
    }
    if (best && !best.crew.some((c) => c.login === member.login)) best.crew.push(member);
  }

  // De-duplicate overlapping grid copies (same date+code), merging crew.
  const byKey = new Map<string, GroundCrewLeg>();
  for (const a of acts) {
    if (a.crew.length === 0) continue;
    const key = `${a.dow}|${a.code}`;
    const existing = byKey.get(key);
    if (existing) {
      for (const m of a.crew) if (!existing.crew.some((c) => c.login === m.login)) existing.crew.push(m);
      existing.location ??= a.location;
      existing.begin ??= a.begin;
      existing.end ??= a.end;
    } else {
      byKey.set(key, { dow: a.dow, code: a.code, location: a.location, begin: a.begin, end: a.end, crew: [...a.crew] });
    }
  }
  return [...byKey.values()];
}

// Attach the ground-activity crew to the matching Simulator/Training duties, keyed by
// weekday+day-of-month + the activity code (= the duty's dutyCode).
export function attachGroundCrewToDuties(duties: ParsedDuty[], legs: GroundCrewLeg[]): void {
  if (legs.length === 0) return;
  for (const d of duties) {
    if (d.dutyType !== 'Simulator' && d.dutyType !== 'Training') continue;
    if (!d.dutyCode) continue;
    const dow = format(parseISO(d.date), 'EEEdd'); // e.g. "Fri03", English weekday like the PDF
    const leg = legs.find((l) => l.code === d.dutyCode && l.dow === dow);
    if (!leg) continue;
    d.crew = sortCrew(leg.crew);
    // The Ground Activity table has explicit begin/end/location columns, so use them to fill the
    // session's start/end (Início/Fim) and airport when the duty grid didn't carry them.
    if (leg.begin && !d.departureTime) d.departureTime = leg.begin;
    if (leg.end && !d.arrivalTime) d.arrivalTime = leg.end;
    if (leg.location && !d.departureAirport) d.departureAirport = leg.location;
  }
}

// Sort crew for display: cockpit first (CP, FO), then cabin (PU, ST), then by surname.
const ROLE_ORDER: Record<string, number> = { CP: 0, FO: 1, PU: 2, ST: 3 };
export function sortCrew(crew: CrewMember[]): CrewMember[] {
  return [...crew].sort((a, b) =>
    (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.surname.localeCompare(b.surname));
}

// Match each crew leg to its flight in the parsed roster and attach the crew, in place.
// A leg is keyed by weekday+day-of-month (e.g. "Thu15") + flight number + departure, which
// disambiguates the same flight number flown on different dates across a long roster.
export function attachCrewToDuties(duties: ParsedDuty[], legs: CrewLeg[]): void {
  if (legs.length === 0) return;
  for (const d of duties) {
    if (d.dutyType !== 'Flight Duty' || !d.flightNumber) continue;
    const dow = format(parseISO(d.date), 'EEEdd'); // e.g. "Thu15", English weekday like the PDF
    // Confirm by the FLIGHT, not just the day: the crew section's day label alone can't
    // tell e.g. 1 Jun from 1 Jul apart, so we require the flight number to match and the
    // route (departure + arrival, when known) to agree, plus the weekday+day.
    const sameRoute = (l: CrewLeg) =>
      (l.dep == null || d.departureAirport == null || l.dep === d.departureAirport) &&
      (l.arr == null || d.arrivalAirport == null || l.arr === d.arrivalAirport);
    const leg = legs.find((l) => l.flightNumber === d.flightNumber && l.dow === dow && sameRoute(l));
    if (leg) d.crew = sortCrew(leg.crew);
  }

  // Fill return/onward legs of a same-day rotation. The PDF lists the crew only ONCE per
  // rotation when it doesn't change (e.g. only the outbound LIS→AGP, not the AGP→LIS
  // return). A leg whose crew DID change has its own entry and was matched above, so here
  // we only fill legs that still have no crew — copying it from a sibling in the same
  // continuous same-day rotation (same airframe → same crew).
  const flightLegs = operatedFlights(duties).filter((d) => d.flightNumber);
  for (const chain of rotationChains(flightLegs)) {
    const chainDuties = chain as ParsedDuty[];
    const withCrew = chainDuties.find((l) => l.crew && l.crew.length > 0);
    if (!withCrew?.crew) continue;
    for (const l of chainDuties) {
      if (!l.crew || l.crew.length === 0) l.crew = withCrew.crew.map((c) => ({ ...c }));
    }
  }

  // Overnight / next-day returns: when a pairing sleeps away from base, the return flies on a
  // LATER day and the PDF gives it no Crew Information entry (same crew), so the same-day pass
  // above can't reach it. Walk the legs in time order (operatedFlights is already chronological)
  // and fill a still-crewless leg from the inbound that fed its departure airport — the flight
  // the crew arrived on — when that was within a plausible layover. The user's rule: a dateless
  // return is flown by the outbound's crew, even on another day.
  for (let i = 0; i < flightLegs.length; i++) {
    const leg = flightLegs[i];
    if ((leg.crew && leg.crew.length > 0) || !leg.departureAirport) continue;
    let feeder: ParsedDuty | undefined;
    for (let j = i - 1; j >= 0; j--) {
      if (flightLegs[j].arrivalAirport === leg.departureAirport) { feeder = flightLegs[j]; break; }
    }
    if (!feeder?.crew || feeder.crew.length === 0) continue;
    const gap = layoverHours(feeder.date, feeder.arrivalTime, leg.date, leg.departureTime);
    if (gap !== null && gap >= -2 && gap <= 48) leg.crew = feeder.crew.map((c) => ({ ...c }));
  }
}

// Hours from an arrival to a later departure (UTC date+time); falls back to the whole-day gap
// when a time is missing. Used to keep cross-day crew propagation within a real layover.
function layoverHours(d1: string, t1: string | null, d2: string, t2: string | null): number | null {
  const [a, b] = t1 && t2
    ? [Date.parse(`${d1}T${t1}:00Z`), Date.parse(`${d2}T${t2}:00Z`)]
    : [Date.parse(`${d1}T00:00:00Z`), Date.parse(`${d2}T00:00:00Z`)];
  if (isNaN(a) || isNaN(b)) return null;
  return (b - a) / 3_600_000;
}

// Re-derive crew from scratch: clear whatever crew the duties already carry (possibly stale,
// parsed by an older version) and attach again from the given legs. Used when re-processing a
// stored roster's PDF after the parser improved, so old rosters pick up the new crew logic.
export function reattachCrew(duties: ParsedDuty[], legs: CrewLeg[], groundLegs: GroundCrewLeg[] = []): void {
  for (const d of duties) if (d.crew) d.crew = undefined;
  attachCrewToDuties(duties, legs);
  attachGroundCrewToDuties(duties, groundLegs);
}
