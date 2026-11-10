import type { ParsedDuty } from './types';
import { dutyWindow, type DutyWindow } from './dutyTime';
import { AIRPORT_COORD } from './airports';
import { sunTimes } from '../utils/sun';
import { utcDateTime } from '../utils/duration';

// What the crew member's day is about right now, so the home screen can change with it:
// before the report (pre-flight), on duty, sleeping away from base (layover), on standby, or
// off. Derived from the roster only — nothing is asked of the user.

export type Phase = 'preflight' | 'duty' | 'standby' | 'layover' | 'off';

export interface Leg {
  duty: ParsedDuty;
  off: Date; // departure instant
  on: Date; // arrival instant (next day when it crossed midnight)
}

export interface DayContext {
  phase: Phase;
  now: Date;
  // The duty day the screen is about: the one in progress, else the next one.
  date: string | null;
  duties: ParsedDuty[];
  window: DutyWindow | null;
  legs: Leg[];
  currentLeg: Leg | null; // airborne now
  nextLeg: Leg | null; // the next departure today
  // Where the crew member is (IATA): the last arrival before now, else the base.
  location: string;
  // The last duty period that already ended (for the rest that follows it).
  lastEnd: Date | null;
}

const FLIGHT = new Set(['Flight Duty', 'Positioning']);
const STANDBY = new Set(['Standby Home', 'Standby Airport', 'Reserve']);
// Days that are not work, whatever times they carry.
const NOT_WORK = new Set(['Day Off', 'Vacation', 'Absence']);
const DAY = 86_400_000;
// A report this close counts as "getting ready to fly" rather than a day off.
const PREFLIGHT_HOURS = 16;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const shiftDay = (iso: string, by: number) => isoDay(new Date(Date.parse(`${iso}T12:00:00Z`) + by * DAY));

// The day's operated legs as real instants, in order.
export function legsOf(date: string, duties: ParsedDuty[]): Leg[] {
  const legs: Leg[] = [];
  for (const d of duties) {
    if (!FLIGHT.has(d.dutyType) || !d.departureTime || !d.arrivalTime) continue;
    const off = utcDateTime(date, d.departureTime);
    let on = utcDateTime(date, d.arrivalTime);
    if (on.getTime() < off.getTime()) on = new Date(on.getTime() + DAY);
    legs.push({ duty: d, off, on });
  }
  // A leg departing "earlier" than the first one on the clock crossed midnight in the roster.
  legs.sort((a, b) => a.off.getTime() - b.off.getTime());
  return legs;
}

function byDate(duties: ParsedDuty[]): Map<string, ParsedDuty[]> {
  const m = new Map<string, ParsedDuty[]>();
  for (const d of duties) {
    if (!m.has(d.date)) m.set(d.date, []);
    m.get(d.date)!.push(d);
  }
  return m;
}

export function dayContext(all: ParsedDuty[], now: Date, base: string): DayContext {
  const days = byDate(all);
  const today = isoDay(now);
  const work = (date: string) => (days.get(date) ?? []).filter((d) => !NOT_WORK.has(d.dutyType));

  // Where the crew member is: the arrival of the last leg that landed before now.
  let location = base;
  let lastEnd: Date | null = null;
  const past = [...days.keys()].filter((d) => d <= today).sort();
  for (const date of past) {
    for (const leg of legsOf(date, days.get(date)!)) {
      if (leg.on.getTime() <= now.getTime() && leg.duty.arrivalAirport) location = leg.duty.arrivalAirport.toUpperCase();
    }
  }

  // The duty days around now: yesterday (a duty past midnight), today and the week ahead.
  const candidates: { date: string; window: DutyWindow }[] = [];
  for (let i = -1; i <= 8; i++) {
    const date = shiftDay(today, i);
    const w = dutyWindow(date, work(date));
    if (w) candidates.push({ date, window: w });
  }
  for (const c of candidates) if (c.window.end.getTime() <= now.getTime()) lastEnd = c.window.end;

  const make = (phase: Phase, date: string | null, window: DutyWindow | null): DayContext => {
    const duties = date ? days.get(date) ?? [] : [];
    const legs = date ? legsOf(date, duties) : [];
    const t = now.getTime();
    return {
      phase, now, date, duties, window, legs,
      currentLeg: legs.find((l) => l.off.getTime() <= t && t < l.on.getTime()) ?? null,
      nextLeg: legs.find((l) => l.off.getTime() > t) ?? null,
      location, lastEnd,
    };
  };

  const current = candidates.find((c) => c.window.start.getTime() <= now.getTime() && now.getTime() < c.window.end.getTime());
  if (current) {
    const onlyStandby = work(current.date).every((d) => STANDBY.has(d.dutyType));
    return make(onlyStandby ? 'standby' : 'duty', current.date, current.window);
  }

  const next = candidates.find((c) => c.window.start.getTime() > now.getTime()) ?? null;
  if (location !== base.toUpperCase()) return make('layover', next?.date ?? null, next?.window ?? null);
  if (next && next.window.start.getTime() - now.getTime() <= PREFLIGHT_HOURS * 3_600_000) {
    const onlyStandby = work(next.date).every((d) => STANDBY.has(d.dutyType));
    return make(onlyStandby ? 'standby' : 'preflight', next.date, next.window);
  }
  return make('off', next?.date ?? null, next?.window ?? null);
}

// ── The sky over where the crew member is, for the header ──

export type Sky = 'night' | 'dawn' | 'day' | 'dusk';

export function skyAt(airport: string, now: Date): { sky: Sky; sunrise: Date | null; sunset: Date | null } {
  const c = AIRPORT_COORD[airport.toUpperCase()] ?? AIRPORT_COORD.LIS;
  const date = isoDay(now);
  const s = sunTimes(c.lat, c.lon, date);
  const sunrise = s.sunriseUtc ? utcDateTime(date, s.sunriseUtc) : null;
  const sunset = s.sunsetUtc ? utcDateTime(date, s.sunsetUtc) : null;
  if (s.polarDay) return { sky: 'day', sunrise, sunset };
  if (!sunrise || !sunset) return { sky: 'night', sunrise, sunset };
  const t = now.getTime();
  const min = 60_000;
  if (t >= sunrise.getTime() - 75 * min && t < sunrise.getTime() + 45 * min) return { sky: 'dawn', sunrise, sunset };
  if (t >= sunset.getTime() - 60 * min && t < sunset.getTime() + 45 * min) return { sky: 'dusk', sunrise, sunset };
  if (t >= sunrise.getTime() && t < sunset.getTime()) return { sky: 'day', sunrise, sunset };
  return { sky: 'night', sunrise, sunset };
}

// ── The day's destination sets the accent colour ──

const ISLANDS = new Set(['FNC', 'PXO', 'PDL', 'TER', 'HOR', 'PIX', 'LPA', 'TFN', 'TFS', 'ACE', 'FUE', 'SPC', 'PMI', 'IBZ', 'MAH']);
const SOUTH = new Set(['FAO', 'AGP', 'SVQ', 'XRY', 'RAK', 'CMN', 'RBA', 'TNG', 'FEZ', 'ALG', 'TUN', 'MLA', 'NAP', 'FCO', 'MRS', 'NCE', 'VLC']);

export type Accent = 'islands' | 'south' | 'north' | 'base';

export function accentFor(destination: string | null | undefined, base: string): Accent {
  if (!destination) return 'base';
  const d = destination.toUpperCase();
  if (d === base.toUpperCase()) return 'base';
  if (ISLANDS.has(d)) return 'islands';
  if (SOUTH.has(d)) return 'south';
  return 'north';
}

// The furthest point of the day: the first leg's destination when it's away from base.
export function dayDestination(legs: Leg[], base: string): string | null {
  const away = legs.map((l) => l.duty.arrivalAirport?.toUpperCase()).find((a) => a && a !== base.toUpperCase());
  return away ?? null;
}

const CITY: Record<string, string> = {
  LIS: 'Lisboa', OPO: 'Porto', FAO: 'Faro', FNC: 'Funchal', PXO: 'Porto Santo', PDL: 'Ponta Delgada',
  TER: 'Terceira', HOR: 'Horta', PIX: 'Pico', MAD: 'Madrid', BCN: 'Barcelona', AGP: 'Málaga', SVQ: 'Sevilha',
  VLC: 'Valência', BIO: 'Bilbau', VGO: 'Vigo', SCQ: 'Santiago', PMI: 'Palma', IBZ: 'Ibiza', MAH: 'Menorca',
  LPA: 'Gran Canaria', TFN: 'Tenerife', TFS: 'Tenerife', ACE: 'Lanzarote', NCE: 'Nice', CDG: 'Paris', ORY: 'Paris',
  LYS: 'Lyon', TLS: 'Toulouse', BOD: 'Bordéus', MRS: 'Marselha', NTE: 'Nantes', BLQ: 'Bolonha', FLR: 'Florença',
  FCO: 'Roma', MXP: 'Milão', LIN: 'Milão', VCE: 'Veneza', NAP: 'Nápoles', TRN: 'Turim', FRA: 'Frankfurt',
  MUC: 'Munique', DUS: 'Düsseldorf', HAM: 'Hamburgo', STR: 'Estugarda', BER: 'Berlim', CGN: 'Colónia',
  NUE: 'Nuremberga', RAK: 'Marraquexe', CMN: 'Casablanca', RBA: 'Rabat', TNG: 'Tânger', LHR: 'Londres',
  LGW: 'Londres', MAN: 'Manchester', DUB: 'Dublin', AMS: 'Amesterdão', BRU: 'Bruxelas', LUX: 'Luxemburgo',
  GVA: 'Genebra', ZRH: 'Zurique', VIE: 'Viena',
};
export const cityName = (iata: string) => CITY[iata.toUpperCase()] ?? iata.toUpperCase();
