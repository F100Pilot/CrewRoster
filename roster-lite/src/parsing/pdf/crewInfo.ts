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

const DOW = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\d{2}$/;
const NUM = /^\d{2,4}$/;
const AIRPORT = /^[A-Z]{3}$/;
// A crew token: LOGIN, SURNAME, ROLE [FIRST NAME]. Allow an optional space after the
// first comma (the PDF is inconsistent: "GROVISCO, ROVISCO, CP" vs "JRIBEIRO,RIBEIRO, CP").
const CREW = /^([A-Za-z]+),\s*([A-Za-z]+),\s*(CP|FO|PU|ST)\b\s*(.*)$/i;

export interface CrewLeg {
  dow: string; // weekday+day-of-month, e.g. "Thu15"
  flightNumber: string; // e.g. "TP1438"
  dep: string | null;
  arr: string | null;
  crew: CrewMember[];
}

function parseCrewToken(text: string): CrewMember | null {
  const m = text.match(CREW);
  if (!m) return null;
  const firstName = m[4].trim().replace(/\s+/g, ' ') || undefined;
  return { login: m[1].toUpperCase(), surname: m[2].toUpperCase(), role: m[3].toUpperCase(), firstName };
}

// Extract every leg (with its crew) from the crew-information section of a duty-plan PDF.
export function parseCrewInfo(tokens: PositionedToken[]): CrewLeg[] {
  // Anchor on the "Crew Information on Leg" header so we don't depend on a fixed page and
  // we stay in the FLIGHT crew zone — the separate simulator/office crew zones have no
  // flight carrier, so the carrier-anchoring below also naturally excludes them.
  const header = tokens.find((z) => /Crew Information on Leg/i.test(z.text));
  if (!header) return [];
  const startPage = header.page;

  const legs: (CrewLeg & { page: number; x: number; dowY: number })[] = [];

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
    const airports = seg.filter((z) => AIRPORT.test(z.text));

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
  for (const ct of tokens.filter((z) => z.page >= startPage && CREW.test(z.text))) {
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
    if (best && !best.crew.some((c) => c.login === member.login)) best.crew.push(member);
  }

  // De-duplicate overlapping grid copies: merge legs with the same date+flight+route,
  // keeping the union of crew. Drop legs that ended up with no crew.
  const byKey = new Map<string, CrewLeg>();
  for (const leg of legs) {
    const key = `${leg.dow}|${leg.flightNumber}|${leg.dep ?? ''}-${leg.arr ?? ''}`;
    const existing = byKey.get(key);
    if (existing) {
      for (const m of leg.crew) if (!existing.crew.some((c) => c.login === m.login)) existing.crew.push(m);
    } else {
      byKey.set(key, { dow: leg.dow, flightNumber: leg.flightNumber, dep: leg.dep, arr: leg.arr, crew: [...leg.crew] });
    }
  }
  return [...byKey.values()].filter((l) => l.crew.length > 0);
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
    const leg = legs.find((l) =>
      l.flightNumber === d.flightNumber && l.dow === dow &&
      (l.dep == null || d.departureAirport == null || l.dep === d.departureAirport));
    if (leg) d.crew = sortCrew(leg.crew);
  }
}
