import type { AircraftReg, ParsedDuty } from './types';
import { fetchFlightInfo, type FlightInfo } from '../services/crewlinkApi';
import { operatedFlights } from './flightTime';
import { loadRegs, regKey, saveReg } from '../storage/rosterStore';

// Pick the leg matching a duty's route (the same flight number can fly several sectors
// on a day, and AeroDataBox sometimes returns more than one record per number/date —
// e.g. a scheduled entry without a tail plus an operated one with it). Within each
// candidate tier (exact route → same departure → anything) prefer a leg that actually
// carries a registration, so a regless duplicate never shadows the real one.
export function matchLeg(
  flights: FlightInfo[], dep: string | null, arr: string | null,
): FlightInfo | null {
  if (flights.length === 0) return null;
  const pick = (list: FlightInfo[]): FlightInfo | null =>
    list.length === 0 ? null : (list.find((f) => f.reg) ?? list[0]);
  return (
    pick(flights.filter((f) => f.departure.iata === dep && f.arrival.iata === arr)) ??
    pick(flights.filter((f) => f.departure.iata === dep)) ??
    pick(flights)
  );
}

// The in-memory lookup key for a recorded reg: date + flight + route. Matches the storage
// key (minus userId, since the map is already scoped to one user) and keeps two sectors of
// the same flight number on a day distinct.
export function regMapKey(
  date: string, flightNumber: string, dep: string | null, arr: string | null,
): string {
  return `${date}|${flightNumber}|${dep ?? ''}-${arr ?? ''}`;
}

// The fields of a duty needed to record/identify its tail.
type RegDuty = Pick<ParsedDuty, 'date' | 'flightNumber' | 'departureAirport' | 'arrivalAirport'>;

// Record (or update) the registration flown on a duty. No-op without a reg/flight number.
export async function recordReg(
  userId: string, duty: RegDuty, leg: FlightInfo,
): Promise<AircraftReg | null> {
  if (!leg.reg || !duty.flightNumber) return null;
  const entry: AircraftReg = {
    key: regKey(userId, duty.date, duty.flightNumber, duty.departureAirport, duty.arrivalAirport),
    userId,
    date: duty.date,
    flightNumber: duty.flightNumber,
    dep: duty.departureAirport,
    arr: duty.arrivalAirport,
    reg: leg.reg,
    model: leg.model ?? null,
    recordedAt: new Date().toISOString(),
  };
  await saveReg(entry);
  return entry;
}

// A lookup of recorded registrations keyed by date+flight+route for the logbook/day view.
export async function regMap(userId: string): Promise<Map<string, AircraftReg>> {
  const all = await loadRegs(userId);
  const m = new Map<string, AircraftReg>();
  for (const r of all) m.set(regMapKey(r.date, r.flightNumber, r.dep, r.arr), r);
  return m;
}

export interface BackfillProgress { done: number; total: number; found: number }
export interface BackfillResult {
  found: number;
  processed: number;
  total: number;
  // why it ended early, if it did: 'quota' (API limit), 'auth' (not subscribed/forbidden),
  // 'not_configured' (no key), 'cancelled'.
  stopped?: 'quota' | 'auth' | 'not_configured' | 'cancelled';
  // the last upstream error seen (e.g. "upstream_400"), to explain a 0-found run.
  lastError?: string;
  // how many lookups returned no flight at all (typically: history not in the plan).
  emptyCount: number;
}

// How many API requests a backfill would send — shown to the user before they confirm,
// so they can judge the cost against the 100 req/month free-tier allowance.
export async function pendingBackfillCount(userId: string, duties: ParsedDuty[]): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await regMap(userId);
  return operatedFlights(duties).filter(
    (d) => d.flightNumber && d.date <= today && !existing.has(regMapKey(d.date, d.flightNumber, d.departureAirport, d.arrivalAirport)),
  ).length;
}

// Look up and store registrations for every operated sector that doesn't have one yet,
// up to today (AeroDataBox only has data for past/near flights). Sequential and gently
// throttled to respect the API; stops cleanly when the quota/auth fails or on cancel.
export async function backfillRegs(
  userId: string,
  duties: ParsedDuty[],
  onProgress?: (p: BackfillProgress) => void,
  shouldStop?: () => boolean,
): Promise<BackfillResult> {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await regMap(userId);
  const pending = operatedFlights(duties).filter(
    (d) => d.flightNumber && d.date <= today && !existing.has(regMapKey(d.date, d.flightNumber, d.departureAirport, d.arrivalAirport)),
  );

  let found = 0;
  let emptyCount = 0;
  let lastError: string | undefined;
  for (let i = 0; i < pending.length; i++) {
    if (shouldStop?.()) return { found, processed: i, total: pending.length, stopped: 'cancelled', emptyCount, lastError };
    const d = pending[i];
    const r = await fetchFlightInfo(d.flightNumber!, d.date);
    if (!r.configured) return { found, processed: i, total: pending.length, stopped: 'not_configured', emptyCount, lastError };
    if (r.error) lastError = r.error;
    // Quota or auth problems won't fix themselves on the next call — stop and report.
    if (/_429$/.test(r.error ?? '')) return { found, processed: i, total: pending.length, stopped: 'quota', emptyCount, lastError };
    if (/_40[13]$/.test(r.error ?? '')) return { found, processed: i, total: pending.length, stopped: 'auth', emptyCount, lastError };
    const leg = matchLeg(r.flights, d.departureAirport, d.arrivalAirport);
    if (leg?.reg) { await recordReg(userId, d, leg); found++; }
    else if (r.flights.length === 0) emptyCount++;
    onProgress?.({ done: i + 1, total: pending.length, found });
    // AeroDataBox free tier: hard limit of 1 req/s — wait 1.1 s between calls.
    if (i < pending.length - 1) await new Promise((res) => setTimeout(res, 1100));
  }
  return { found, processed: pending.length, total: pending.length, emptyCount, lastError };
}

// Quietly capture registrations for the last `windowDays` of flights — the window where
// the free AeroDataBox plan actually has data. Best-effort and bounded (a handful of
// requests), meant to run once a day so the logbook fills itself "going forward" without
// the user opening each day. Returns how many tails it recorded.
export async function autoCaptureRecent(
  userId: string, duties: ParsedDuty[], windowDays = 10,
): Promise<number> {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - windowDays);
  const fromISO = from.toISOString().slice(0, 10);
  const recent = duties.filter((d) => d.date >= fromISO);
  if (recent.length === 0) return 0;
  const res = await backfillRegs(userId, recent);
  return res.found;
}
