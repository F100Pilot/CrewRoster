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
  // why it ended early, if it did: 'quota' (API limit), 'not_configured', 'cancelled'.
  stopped?: 'quota' | 'not_configured' | 'cancelled';
}

// Look up and store registrations for every operated sector that doesn't have one yet,
// up to today (AeroDataBox only has data for past/near flights). Sequential and gently
// throttled to respect the API; stops cleanly when the quota is hit or on cancel.
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
  for (let i = 0; i < pending.length; i++) {
    if (shouldStop?.()) return { found, processed: i, total: pending.length, stopped: 'cancelled' };
    const d = pending[i];
    const r = await fetchFlightInfo(d.flightNumber!, d.date);
    if (!r.configured) return { found, processed: i, total: pending.length, stopped: 'not_configured' };
    if (r.error === 'upstream_429') return { found, processed: i, total: pending.length, stopped: 'quota' };
    const leg = matchLeg(r.flights, d.departureAirport, d.arrivalAirport);
    if (leg?.reg) { await recordReg(userId, d, leg); found++; }
    onProgress?.({ done: i + 1, total: pending.length, found });
    await new Promise((res) => setTimeout(res, 250)); // be gentle with the API
  }
  return { found, processed: pending.length, total: pending.length };
}
