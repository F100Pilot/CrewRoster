import type { AircraftReg, LogbookRow, ParsedDuty } from './types';
import { operatedFlights } from './flightTime';
import { regMapKey, resolveRegs } from './aircraftRegs';
import { logbookRowKey } from '../storage/rosterStore';
import { diffMinutes, formatDuration } from '../utils/duration';

// A pilot's logbook row, one per operated sector. Built straight from the roster so
// there's nothing to copy by hand.
export interface LogbookEntry {
  date: string;
  flightNumber: string;
  from: string;
  to: string;
  off: string; // departure time, UTC "HH:mm"
  on: string; // arrival time, UTC "HH:mm"
  blockMinutes: number;
  aircraft: string;
  reg: string; // aircraft registration (recorded from flight info), or ''
  regInferred: boolean; // tail inferred from a same-day rotation sibling, not captured directly
}

// `regs` maps date+flight+route → recorded registration; pass it to fill the tail. Tails
// are resolved across same-day rotations too (one captured leg fills its siblings).
export function logbookEntries(
  duties: ParsedDuty[], regs?: Map<string, AircraftReg>,
): LogbookEntry[] {
  const resolved = resolveRegs(duties, regs ?? new Map());
  return operatedFlights(duties).map((d) => {
    const hit = resolved.get(regMapKey(d.date, d.flightNumber ?? '', d.departureAirport, d.arrivalAirport));
    return {
      date: d.date,
      flightNumber: d.flightNumber ?? '',
      from: d.departureAirport ?? '',
      to: d.arrivalAirport ?? '',
      off: d.departureTime!,
      on: d.arrivalTime!,
      blockMinutes: diffMinutes(d.departureTime!, d.arrivalTime!),
      aircraft: d.aircraftType ?? '',
      reg: hit?.reg ?? '',
      regInferred: hit?.inferred ?? false,
    };
  });
}

// ── Permanent logbook rows ───────────────────────────────────────────────────────────

// Block minutes for a persisted row (derived, not stored, so an edit to off/on is enough).
export function rowBlock(r: LogbookRow): number {
  return diffMinutes(r.off, r.on);
}

// Chronological order: by date, then by off-block time within the day.
export function sortLogbook(rows: LogbookRow[]): LogbookRow[] {
  return [...rows].sort((a, b) => (a.date === b.date ? a.off.localeCompare(b.off) : a.date.localeCompare(b.date)));
}

// Merge a roster into the permanent logbook: returns the rows to upsert — brand-new
// sectors, plus refreshes of non-edited rows whose roster data (times/aircraft) or
// resolved tail changed. Hand-edited rows are never overwritten, and a known tail is
// never wiped by a roster that lacks one.
export function mergeLogbook(
  existing: LogbookRow[], duties: ParsedDuty[], userId: string, regs?: Map<string, AircraftReg>,
): LogbookRow[] {
  const byKey = new Map(existing.map((r) => [r.key, r]));
  const resolved = resolveRegs(duties, regs ?? new Map());
  const upserts: LogbookRow[] = [];
  for (const d of operatedFlights(duties)) {
    if (!d.flightNumber) continue;
    const key = logbookRowKey(userId, d.date, d.flightNumber, d.departureAirport, d.arrivalAirport);
    const cur = byKey.get(key);
    if (cur?.edited) continue; // respect manual edits
    const lookup = resolved.get(regMapKey(d.date, d.flightNumber, d.departureAirport, d.arrivalAirport));
    const next: LogbookRow = {
      key, userId,
      date: d.date,
      flightNumber: d.flightNumber,
      from: d.departureAirport ?? '',
      to: d.arrivalAirport ?? '',
      off: d.departureTime!,
      on: d.arrivalTime!,
      aircraft: d.aircraftType ?? '',
      reg: lookup?.reg || cur?.reg || '', // never wipe a known tail with a blank
      regInferred: lookup?.reg ? !!lookup.inferred : (cur?.regInferred ?? false),
    };
    if (!cur || cur.from !== next.from || cur.to !== next.to || cur.off !== next.off ||
        cur.on !== next.on || cur.aircraft !== next.aircraft || cur.reg !== next.reg ||
        !!cur.regInferred !== !!next.regInferred) {
      upserts.push(next);
    }
  }
  return upserts;
}

// CSV (CRLF, spreadsheet-friendly) straight from the persisted rows.
export function logbookCsvRows(rows: LogbookRow[]): string {
  const header = ['Data', 'Voo', 'De', 'Para', 'Off (UTC)', 'On (UTC)', 'Bloco', 'Aeronave', 'Matrícula'];
  const body = sortLogbook(rows).map((r) => [
    r.date, r.flightNumber, r.from, r.to, r.off, r.on, formatDuration(rowBlock(r)), r.aircraft, r.reg,
  ]);
  return [header, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// Take-off/landing recency: 3 landings in the preceding 90 days. Currency stays valid
// until 90 days after the 3rd-most-recent landing; below 3 landings ever, not current.
export interface Recency { landings90: number; current: boolean; validUntil: string | null }

// Dates of real landings (one operated sector = one landing), deduped by day+flight+route
// so a duplicate or re-imported row can't inflate a safety-relevant count, and excluding
// rows with missing or identical endpoints (not a flown sector).
function landingDates(rows: LogbookRow[], refISO: string): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (r.date > refISO || !r.from || !r.to || r.from === r.to) continue;
    seen.set(`${r.date}|${r.flightNumber}|${r.from}-${r.to}`, r.date);
  }
  return [...seen.values()].sort((a, b) => b.localeCompare(a)); // most recent first
}

function windowStartISO(refISO: string, days: number): string {
  const from = new Date(`${refISO}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return from.toISOString().slice(0, 10);
}

export function recencyStatus(rows: LogbookRow[], refISO: string, required = 3, days = 90): Recency {
  const landings = landingDates(rows, refISO);
  const fromISO = windowStartISO(refISO, days);
  const landings90 = landings.filter((d) => d >= fromISO).length;
  const current = landings90 >= required;
  // "Valid until" is meaningful only while current: it's 90 days after the 3rd-most-recent
  // landing (which, when current, lies inside the 90-day window — so the two are consistent).
  let validUntil: string | null = null;
  if (current) {
    const third = new Date(`${landings[required - 1]}T00:00:00Z`);
    third.setUTCDate(third.getUTCDate() + days);
    validUntil = third.toISOString().slice(0, 10);
  }
  return { landings90, current, validUntil };
}

// Landings (deduped operated sectors) in the trailing `days`-day window ending at refISO.
export function landingsInRows(rows: LogbookRow[], refISO: string, days = 90): number {
  const fromISO = windowStartISO(refISO, days);
  return landingDates(rows, refISO).filter((d) => d >= fromISO).length;
}

// ── Logbook statistics ───────────────────────────────────────────────────────────────

export interface LogbookStats {
  sectors: number;
  blockMinutes: number;
  airports: number;
  tails: number; // distinct aircraft registrations flown
  byYear: { year: string; sectors: number; blockMinutes: number }[]; // most recent first
  topAirports: { code: string; visits: number }[];
  byAircraft: { type: string; sectors: number }[];
}

export function logbookStats(rows: LogbookRow[], topN = 8): LogbookStats {
  const years = new Map<string, { sectors: number; blockMinutes: number }>();
  const visits = new Map<string, number>();
  const aircraft = new Map<string, number>();
  const tails = new Set<string>();
  let blockMinutes = 0;

  for (const r of rows) {
    const b = rowBlock(r);
    blockMinutes += b;
    const y = r.date.slice(0, 4);
    const yr = years.get(y) ?? { sectors: 0, blockMinutes: 0 };
    yr.sectors += 1; yr.blockMinutes += b; years.set(y, yr);
    for (const code of [r.from, r.to]) if (code) visits.set(code, (visits.get(code) ?? 0) + 1);
    if (r.aircraft) aircraft.set(r.aircraft, (aircraft.get(r.aircraft) ?? 0) + 1);
    if (r.reg) tails.add(r.reg);
  }

  return {
    sectors: rows.length,
    blockMinutes,
    airports: visits.size,
    tails: tails.size,
    byYear: [...years.entries()]
      .map(([year, v]) => ({ year, ...v }))
      .sort((a, b) => b.year.localeCompare(a.year)),
    topAirports: [...visits.entries()]
      .map(([code, v]) => ({ code, visits: v }))
      .sort((a, b) => b.visits - a.visits || a.code.localeCompare(b.code))
      .slice(0, topN),
    byAircraft: [...aircraft.entries()]
      .map(([type, sectors]) => ({ type, sectors }))
      .sort((a, b) => b.sectors - a.sectors || a.type.localeCompare(b.type)),
  };
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// CSV with a header row, CRLF line endings (spreadsheet-friendly).
export function logbookCsv(entries: LogbookEntry[]): string {
  const header = ['Data', 'Voo', 'De', 'Para', 'Off (UTC)', 'On (UTC)', 'Bloco', 'Aeronave', 'Matrícula'];
  const rows = entries.map((e) => [
    e.date,
    e.flightNumber,
    e.from,
    e.to,
    e.off,
    e.on,
    formatDuration(e.blockMinutes),
    e.aircraft,
    e.reg,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// Landings in the trailing `days`-day window ending at refISO. One operated sector
// is one landing — the basis for recency (e.g. 3 landings in 90 days).
export function landingsInWindow(duties: ParsedDuty[], refISO: string, days = 90): number {
  const ref = new Date(`${refISO}T00:00:00Z`);
  const from = new Date(ref);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  const fromISO = from.toISOString().slice(0, 10);
  return operatedFlights(duties).filter((d) => d.date >= fromISO && d.date <= refISO).length;
}
