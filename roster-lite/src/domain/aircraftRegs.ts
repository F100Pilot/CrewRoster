import type { AircraftReg, ParsedDuty } from './types';
import { fetchFlightInfo, type FlightInfo } from '../services/crewlinkApi';
import { operatedFlights } from './flightTime';
import { loadRegs, regKey, saveReg } from '../storage/rosterStore';

// Pick the leg matching a duty's route (the same flight number can fly several sectors
// on a day); fall back to the departure match, then the first leg.
export function matchLeg(
  flights: FlightInfo[], dep: string | null, arr: string | null,
): FlightInfo | null {
  if (flights.length === 0) return null;
  return (
    flights.find((f) => f.departure.iata === dep && f.arrival.iata === arr) ??
    flights.find((f) => f.departure.iata === dep) ??
    flights[0]
  );
}

// Record (or update) the registration flown on a duty. No-op without a reg/flight number.
export async function recordReg(
  userId: string, duty: ParsedDuty, leg: FlightInfo,
): Promise<AircraftReg | null> {
  if (!leg.reg || !duty.flightNumber) return null;
  const entry: AircraftReg = {
    key: regKey(userId, duty.date, duty.flightNumber),
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

// A lookup of recorded registrations keyed by "date|flightNumber" for the logbook/day view.
export async function regMap(userId: string): Promise<Map<string, AircraftReg>> {
  const all = await loadRegs(userId);
  const m = new Map<string, AircraftReg>();
  for (const r of all) m.set(`${r.date}|${r.flightNumber}`, r);
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
    (d) => d.flightNumber && d.date <= today && !existing.has(`${d.date}|${d.flightNumber}`),
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
    await new Promise((res) => setTimeout(res, 250)); // be gentle with the API
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
