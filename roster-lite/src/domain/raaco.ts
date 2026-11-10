import type { ParsedDuty } from './types';
import { legsOf, type Leg } from './dayPhase';
import { PGA_PILOT_RULES, standbyInterval, workWindow } from './dutyTime';
import { airportTz, tzOffsetMinutes } from '../utils/localTime';

// RAACO — Regulamento de Alimentação e Ajudas de Custo Operacionais, absorbed into the ROV-PGA
// (Revisão 01, cap. 4.5; values in Anexo 7.6, Tabelas 32–34). It covers every crew member — pilots
// and cabin alike ("Tripulante", 4.5.2.2 a) — so, unlike the AE, nothing here is gated on the role.
//
// The rules are read as the company paid them on a real "Abonos Operacionais" statement (May 2026,
// paid apart from the salary the month after); where that practice and the letter of the text
// differ, the comment says so. It is an estimate from the roster alone: the real Meal Plan, what was
// actually loaded and any irregularity are not in the roster.

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'supper';
export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'supper'];
export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Pequeno-almoço', lunch: 'Almoço', dinner: 'Jantar', supper: 'Ceia',
};

// Tabela 32 — meal windows, local time, both ends inclusive (minutes after midnight; a window
// past midnight runs into the next day).
const WINDOW: Record<Meal, [number, number]> = {
  breakfast: [6 * 60, 7 * 60 + 30],
  lunch: [12 * 60 + 30, 14 * 60],
  dinner: [20 * 60 + 30, 22 * 60],
  supper: [23 * 60 + 30, 24 * 60 + 5 * 60], // "Ceia na Base"
};
const SUPPER_AWAY: [number, number] = [22 * 60 + 1, 24 * 60 + 5 * 60]; // "Ceia fora da Base"

// Tabela 33 — allowance for a main meal that was due and not loaded (sectors up to 1h30, a
// second meal on a flight under 5 h, irregularities, DHC). Row 1, a PSV that ends away (the
// start of a night stop), pays the main meals at the local rate of Tabela 34.
export const T33_BREAKFAST = 5;
export const T33_MAIN = 18;

// Tabela 34 — meals on ground and night stop per country, EUR.
export interface CountryRate { breakfast: number; main: number; night: number }
export const TABELA_34: Record<string, CountryRate> = {
  Alemanha: { breakfast: 22, main: 39, night: 10 },
  Áustria: { breakfast: 29, main: 35, night: 10 },
  Bélgica: { breakfast: 25, main: 35, night: 10 },
  'Cabo Verde': { breakfast: 10, main: 25, night: 14 },
  Croácia: { breakfast: 22, main: 34, night: 10 },
  Dinamarca: { breakfast: 25, main: 50, night: 10 },
  Espanha: { breakfast: 18, main: 33, night: 10 },
  Finlândia: { breakfast: 23, main: 39, night: 10 },
  França: { breakfast: 24, main: 40, night: 10 },
  Irlanda: { breakfast: 20, main: 35, night: 10 },
  Itália: { breakfast: 18, main: 39, night: 10 },
  Luxemburgo: { breakfast: 22, main: 42, night: 10 },
  Noruega: { breakfast: 18, main: 50, night: 10 },
  'Países Baixos': { breakfast: 20, main: 39, night: 10 },
  'Portugal (fora da base)': { breakfast: 25, main: 31, night: 10 },
  'Reino Unido': { breakfast: 29, main: 35, night: 10 },
  'República Checa': { breakfast: 17, main: 30, night: 10 },
  Suíça: { breakfast: 26, main: 53, night: 10 },
};

const TZ_COUNTRY: Record<string, string> = {
  'Europe/Lisbon': 'Portugal', 'Atlantic/Madeira': 'Portugal', 'Atlantic/Azores': 'Portugal',
  'Europe/Madrid': 'Espanha', 'Atlantic/Canary': 'Espanha', 'Europe/Paris': 'França', 'Europe/Rome': 'Itália',
  'Europe/Berlin': 'Alemanha', 'Africa/Casablanca': 'Marrocos', 'Europe/London': 'Reino Unido',
  'Europe/Dublin': 'Irlanda', 'Europe/Amsterdam': 'Países Baixos', 'Europe/Brussels': 'Bélgica',
  'Europe/Luxembourg': 'Luxemburgo', 'Europe/Zurich': 'Suíça', 'Europe/Vienna': 'Áustria',
  'Europe/Copenhagen': 'Dinamarca', 'Europe/Helsinki': 'Finlândia', 'Europe/Oslo': 'Noruega',
  'Europe/Prague': 'República Checa', 'Europe/Zagreb': 'Croácia', 'Atlantic/Cape_Verde': 'Cabo Verde',
};

// The country of an airport as Tabela 34 names it, or null when the airport is unknown.
export function countryOf(airport: string): string | null {
  const c = TZ_COUNTRY[airportTz(airport) ?? ''];
  if (!c) return null;
  return c === 'Portugal' ? 'Portugal (fora da base)' : c;
}

export function rateAt(airport: string): CountryRate | null {
  const c = countryOf(airport);
  return c ? TABELA_34[c] ?? null : null;
}

// ── Local clock arithmetic ──
// A moment as "local minutes since the epoch" at an airport: the wall clock there, so a meal
// window is just day × 1440 + its minutes.
const tzOf = (airport: string | null | undefined, base: string) => airportTz(airport) ?? airportTz(base) ?? 'Europe/Lisbon';
const localMin = (d: Date, tz: string) => Math.floor(d.getTime() / 60000) + tzOffsetMinutes(d, tz);
const dayISO = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

interface Occurrence { meal: Meal; day: string; ws: number; we: number; key: string }

function occurrences(from: number, to: number, meals: Meal[], away: boolean): Occurrence[] {
  const out: Occurrence[] = [];
  for (let k = Math.floor(from / 1440) - 1; k <= Math.floor(to / 1440) + 1; k++) {
    for (const meal of meals) {
      const [a, b] = meal === 'supper' && away ? SUPPER_AWAY : WINDOW[meal];
      out.push({ meal, day: dayISO(k), ws: k * 1440 + a, we: k * 1440 + b, key: `${meal}:${dayISO(k)}` });
    }
  }
  return out;
}

// The meals an interval gives the right to (4.5.5.1 / 4.5.5.3): it (a) starts inside a window,
// (b) covers a whole window, or (c) ends after a window opens. (a) and (b) read on the clock where
// it starts, (c) on the clock where it ends (4.5.5.4).
type Basis = 'a' | 'b' | 'c';
interface Acquired { meal: Meal; key: string; day: string; basis: Basis; from: Date; to: Date; overlap: number }

function acquired(start: Date, end: Date, fromTz: string, toTz: string, fromAway: boolean, toAway: boolean, meals: Meal[]): Acquired[] {
  const found = new Map<string, Acquired>();
  const s = localMin(start, fromTz);
  const e = localMin(end, fromTz);
  const offFrom = tzOffsetMinutes(start, fromTz);
  const put = (o: Occurrence, basis: Basis, off: number, ls: number, le: number) => {
    if (found.has(o.key)) return;
    found.set(o.key, {
      meal: o.meal, key: o.key, day: o.day, basis,
      from: new Date((o.ws - off) * 60000), to: new Date((o.we - off) * 60000),
      overlap: Math.max(0, Math.min(le, o.we) - Math.max(ls, o.ws)),
    });
  };
  for (const o of occurrences(s, e, meals, fromAway)) {
    if (s >= o.ws && s <= o.we) put(o, 'a', offFrom, s, e);
    else if (s <= o.ws && e >= o.we) put(o, 'b', offFrom, s, e);
  }
  const s2 = localMin(start, toTz);
  const e2 = localMin(end, toTz);
  const offTo = tzOffsetMinutes(end, toTz);
  for (const o of occurrences(s2, e2, meals, toAway)) {
    if (s2 < o.ws && e2 > o.ws) put(o, 'c', offTo, s2, e2);
  }
  return [...found.values()].sort((x, y) => x.from.getTime() - y.from.getTime());
}

// ── Duty periods ──
// A flight duty period (or an airport standby, 4.5.5.5), as real instants. Home standby gives no
// right (4.5.2.1 a); ground duties (course, simulator, office) are 4.5.9, outside these abonos.
interface Psv { date: string; start: Date; end: Date; legs: Leg[]; from: string; to: string; minutes: number }

function psvsOf(duties: ParsedDuty[], base: string): Psv[] {
  const byDate = new Map<string, ParsedDuty[]>();
  for (const d of duties) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date)!.push(d);
  }
  const out: Psv[] = [];
  for (const [date, day] of byDate) {
    const legs = legsOf(date, day);
    const airportSby = day.filter((d) => d.dutyType === 'Standby Airport').map(standbyInterval).filter((x): x is { start: Date; end: Date } => !!x);
    let start: Date | null = null;
    let end: Date | null = null;
    if (legs.length) {
      // The flight duty: from the report to the release after the last on-blocks (the post-flight).
      const w = workWindow(date, day.filter((d) => d.dutyType === 'Flight Duty' || d.dutyType === 'Positioning'), PGA_PILOT_RULES);
      start = w?.start ?? legs[0].off;
      end = w?.end ?? legs[legs.length - 1].on;
    }
    for (const s of airportSby) {
      start = !start || s.start < start ? s.start : start;
      end = !end || s.end > end ? s.end : end;
    }
    if (!start || !end) continue;
    const from = (legs[0]?.duty.departureAirport ?? base).toUpperCase();
    const to = (legs[legs.length - 1]?.duty.arrivalAirport ?? from).toUpperCase();
    out.push({ date, start, end, legs, from, to, minutes: Math.round((end.getTime() - start.getTime()) / 60000) });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ── Result ──
export type MealHow = 'onboard' | 'dhc' | 'allowance' | 'ground' | 'stay';
export interface MealLine {
  date: string; // the duty's day (as the statement lists it); a stay meal, its local day
  key: string; // the meal and the local day it falls on, so it is counted once
  meal: Meal;
  how: MealHow;
  value: number | null; // € paid on the statement (0 when loaded on board), null when no rate is known
  where: string; // the flight it's loaded on, or the airport
  why: string; // the clause, in a line
}
export interface NightLine { date: string; where: string; value: number | null }

export interface RaacoDay {
  date: string;
  start: string | null; // the day's first flight (the statement's START column)
  stay: string | null; // where the night is spent away (ESCALA PERNOITA)
  meals: MealLine[];
  nights: NightLine[];
  // The statement's columns: Pequeno-almoço, Almoço, Jantar, Ceia + Pernoita.
  breakfast: number;
  lunch: number;
  dinner: number;
  supperNight: number;
  total: number;
  unknownRate: boolean;
}

const BASIS: Record<Basis, string> = {
  a: 'O serviço começa dentro do horário',
  b: 'O serviço abrange o horário',
  c: 'O serviço acaba depois do início do horário',
};

const blockMin = (l: Leg) => Math.round((l.on.getTime() - l.off.getTime()) / 60000);
const flightLabel = (l: Leg) => l.duty.flightNumber ?? `${l.duty.departureAirport}–${l.duty.arrivalAirport}`;
const gapDistance = (l: Leg, a: Acquired) =>
  Math.max(0, l.off.getTime() - a.to.getTime(), a.from.getTime() - l.on.getTime());

function psvMeals(p: Psv, base: string, nextIsStay: boolean, paidInStay: Set<string>): MealLine[] {
  const fromTz = tzOf(p.from, base);
  const toTz = tzOf(p.to, base);
  // A meal the stay before already paid is not loaded again (one right per meal).
  let due = acquired(p.start, p.end, fromTz, toTz, p.from !== base, p.to !== base, MEALS).filter((a) => !paidInStay.has(a.key));
  // A duty of 3h00 or less gives at most one meal (4.5.5.2): the one it overlaps most.
  if (p.minutes <= 180 && due.length > 1) due = [due.reduce((m, x) => (x.overlap > m.overlap ? x : m))];

  // Load each meal on a sector that can carry it: none on sectors up to 1h30 (4.5.11.4), one main
  // meal on sectors under 5 h (4.5.11.2), two on longer ones. The sector must fly through the meal's
  // window on its departure clock (4.5.10.5) — or be the duty's first sector, for a meal due because
  // the duty starts inside the window. As paid in May 2026: a breakfast due at a 07:56 report on a
  // 59-min first sector is not carried by a later sector at noon; it's paid.
  const room = new Map<Leg, number>(p.legs.map((l) => [l, blockMin(l) <= 90 ? 0 : blockMin(l) < 300 ? 1 : 2]));
  const flies = (l: Leg, a: Acquired) => {
    const tz = tzOf(l.duty.departureAirport, base);
    const day = Math.round(Date.parse(`${a.day}T00:00:00Z`) / 86_400_000);
    const [ws, we] = a.meal === 'supper' && (l.duty.departureAirport ?? base).toUpperCase() !== base ? SUPPER_AWAY : WINDOW[a.meal];
    return localMin(l.off, tz) <= day * 1440 + we && localMin(l.on, tz) >= day * 1440 + ws;
  };
  const out: MealLine[] = [];
  for (const a of due) {
    const leg = p.legs
      .filter((l) => (room.get(l) ?? 0) > 0 && (flies(l, a) || (a.basis === 'a' && l === p.legs[0])))
      .sort((x, y) => gapDistance(x, a) - gapDistance(y, a))[0];
    const why = `${BASIS[a.basis]} (4.5.5.1 ${a.basis})`;
    if (leg && leg.duty.dutyType === 'Positioning') {
      // DHC: paid, not counted as a passenger meal (May 2026: the breakfast on a DH to Frankfurt at
      // the German rate, a dinner on a DH home at 18 €) — the local Tabela 34 rate when the DHC ends
      // the duty away, Tabela 33 otherwise (4.5.7.2).
      room.set(leg, room.get(leg)! - 1);
      const local = nextIsStay ? rateAt(p.to) : null;
      const value = nextIsStay ? (local ? (a.meal === 'breakfast' ? local.breakfast : local.main) : null) : a.meal === 'breakfast' ? T33_BREAKFAST : T33_MAIN;
      out.push({
        date: p.date, key: a.key, meal: a.meal, how: 'dhc', value, where: flightLabel(leg),
        why: `${why}; em DHC (4.5.7.2) — ${nextIsStay ? `valor local da Tabela 34 (${p.to})` : 'Tabela 33'}`,
      });
      continue;
    }
    if (leg) {
      room.set(leg, room.get(leg)! - 1);
      out.push({ date: p.date, key: a.key, meal: a.meal, how: 'onboard', value: 0, where: flightLabel(leg), why });
      continue;
    }
    // Not loadable: on ground if a stop of more than 1h30 covers the window (4.5.6), else the
    // allowance (4.5.11.4–6). Either way Tabela 33 — row 1 at the local rate when the duty ends
    // away and the night stop begins.
    const stop = p.legs.slice(1).find((l, i) => {
      const prev = p.legs[i];
      return l.off.getTime() - prev.on.getTime() > 90 * 60000 && prev.on < a.to && l.off > a.from;
    });
    const local = nextIsStay ? rateAt(p.to) : null;
    const value = a.meal === 'breakfast' ? T33_BREAKFAST : nextIsStay ? local?.main ?? null : T33_MAIN;
    const reason = p.legs.length === 0
      ? 'assistência no aeroporto (4.5.5.5)'
      : p.legs.every((l) => blockMin(l) <= 90) ? 'setores até 1h30 não levam refeição principal (4.5.11.4)'
      : 'sem setor para a embarcar (4.5.11.2 / 4.5.11.6)';
    out.push({
      date: p.date, key: a.key, meal: a.meal, how: stop ? 'ground' : 'allowance', value,
      where: stop ? stop.duty.departureAirport ?? '' : p.to,
      why: `${why}; ${stop ? 'em terra (O/G, 4.5.6), até ao valor da Tabela 33' : reason}${nextIsStay && a.meal !== 'breakfast' ? '; Tabela 33, valor local (início de pernoita)' : ''}`,
    });
  }
  return out;
}

// The meals and nights of a stay away from base (4.5.5.3 / 4.5.8), paid at Tabela 34. As paid on
// the May 2026 statement: lunch, dinner and supper (the "fora da base" window) are paid, breakfast
// at the hotel is not, and a meal already due in the duty before or after isn't paid twice.
function stayLines(where: string, from: Date, to: Date, base: string, taken: Set<string>): { meals: MealLine[]; nights: NightLine[] } {
  const tz = tzOf(where, base);
  const rate = rateAt(where);
  const meals = acquired(from, to, tz, tz, true, true, ['lunch', 'dinner', 'supper'])
    .filter((a) => !taken.has(a.key))
    .map<MealLine>((a) => ({
      date: a.day, key: a.key, meal: a.meal, how: 'stay', value: rate?.main ?? null, where,
      why: `Na estadia em ${where} (4.5.5.3 / 4.5.8, Tabela 34)`,
    }));
  // A night stop per night the stay spends in — any part of 00:00–05:00 local — dated the evening
  // before. Counting midnights instead missed a stay that starts after one: a late arrival in Praia
  // (00:15 local) and away again in the morning is a night in Cabo Verde, 14 € (user's colleague).
  const nights: NightLine[] = [];
  const s = localMin(from, tz);
  const e = localMin(to, tz);
  for (let k = Math.floor(s / 1440); k * 1440 < e; k++) {
    if (s < k * 1440 + 5 * 60) nights.push({ date: dayISO(k - 1), where, value: rate?.night ?? null });
  }
  return { meals, nights };
}

// Longest stay counted after a duty that ends away, if the roster has nothing after it.
const MAX_STAY_MS = 4 * 86_400_000;

export function raacoDays(roster: ParsedDuty[], base: string): Map<string, RaacoDay> {
  const b = base.toUpperCase();
  // The Meal Plan is built on the schedule (4.5.10), so a sector's planned times — kept when a later
  // sync replaced them with the flown ones — decide which meals are due and where they're loaded.
  const duties = roster.map((d) => (d.planned ? {
    ...d,
    reportingTime: d.planned.reportingTime ?? d.reportingTime,
    departureTime: d.planned.departureTime ?? d.departureTime,
    arrivalTime: d.planned.arrivalTime ?? d.arrivalTime,
  } : d));
  const psvs = psvsOf(duties, b);
  const lines: MealLine[] = [];
  const nights: NightLine[] = [];
  const stayOf = new Map<string, string>();
  const key = (m: MealLine) => m.key;
  // In order: each duty, then the stay after it when it ends away. A meal due both in the stay and
  // in the duty that ends it is paid in the stay (May 2026: lunch at the Frankfurt rate on the day
  // back); one due in the duty before the stay is not paid again in it (4.5.8.2).
  let paidInStay = new Set<string>();
  psvs.forEach((p, i) => {
    const next = psvs[i + 1];
    const endsAway = p.to !== b;
    const meals = psvMeals(p, b, endsAway, paidInStay);
    lines.push(...meals);
    paidInStay = new Set();
    if (!endsAway) return;
    const until = next && next.start.getTime() - p.end.getTime() < MAX_STAY_MS ? next.start : new Date(p.end.getTime() + 12 * 3600_000);
    const stay = stayLines(p.to, p.end, until, b, new Set(meals.map(key)));
    lines.push(...stay.meals);
    nights.push(...stay.nights);
    for (const n of stay.nights) stayOf.set(n.date, p.to);
    paidInStay = new Set(stay.meals.map(key));
  });

  const days = new Map<string, RaacoDay>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) {
      d = { date, start: null, stay: null, meals: [], nights: [], breakfast: 0, lunch: 0, dinner: 0, supperNight: 0, total: 0, unknownRate: false };
      days.set(date, d);
    }
    return d;
  };
  for (const p of psvs) {
    const d = day(p.date);
    d.start = d.start ?? (p.legs[0] ? flightLabel(p.legs[0]) : 'SBY');
  }
  for (const m of lines) {
    const d = day(m.date);
    d.meals.push(m);
    if (m.value === null) { d.unknownRate = true; continue; }
    if (m.meal === 'breakfast') d.breakfast += m.value;
    else if (m.meal === 'lunch') d.lunch += m.value;
    else if (m.meal === 'dinner') d.dinner += m.value;
    else d.supperNight += m.value;
  }
  for (const n of nights) {
    const d = day(n.date);
    d.nights.push(n);
    d.stay = n.where;
    if (n.value === null) d.unknownRate = true;
    else d.supperNight += n.value;
  }
  for (const [date, where] of stayOf) day(date).stay = where;
  // A day with no duty period of its own (a simulator during a stay, say) shows its first code.
  for (const d of days.values()) {
    if (d.start) continue;
    const own = duties.find((x) => x.date === d.date && x.dutyType !== 'Day Off');
    d.start = own?.dutyCode ?? null;
  }
  for (const d of days.values()) {
    d.meals.sort((x, y) => MEALS.indexOf(x.meal) - MEALS.indexOf(y.meal));
    d.total = d.breakfast + d.lunch + d.dinner + d.supperNight;
  }
  return days;
}
