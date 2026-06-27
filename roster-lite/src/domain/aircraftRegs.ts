import type { AircraftReg, ParsedDuty } from './types';
import { fetchFlightInfo, type FlightInfo } from '../services/crewlinkApi';
import { operatedFlights } from './flightTime';
import { utcDateTime } from '../utils/duration';
import { loadRegs, regKey, saveReg } from '../storage/rosterStore';

// Max ground time between two legs for them to count as the same continuous rotation
// (and therefore the same airframe). A tight turnaround (e.g. LIS→GVA→LIS) is well under
// this; a multi-hour sit at base is a separate rotation that may use a different aircraft.
const MAX_TURNAROUND_MIN = 180;

// Pick the leg matching a duty's route (the same flight number can fly several sectors
// on a day, and AeroDataBox sometimes returns more than one record per number/date —
// e.g. a scheduled entry without a tail plus an operated one with it). Within each
// candidate tier (exact route → same departure → anything) prefer a leg that actually
// carries a registration, so a regless duplicate never shadows the real one.
export function matchLeg(
  flights: FlightInfo[], dep: string | null, arr: string | null, dateISO?: string | null,
): FlightInfo | null {
  if (flights.length === 0) return null;
  // The same flight number flies daily, and AeroDataBox can return neighbouring days' operations
  // for a number/date — yesterday's completed leg (with a tail and "Arrived" status) would then
  // shadow today's not-yet-operated one. Restrict to legs scheduled on the rostered day, but only
  // when at least one matches, so we never end up worse off than before.
  let pool = flights;
  if (dateISO) {
    const sameDay = flights.filter((f) => (f.departure.scheduledUtc ?? '').slice(0, 10) === dateISO);
    if (sameDay.length) pool = sameDay;
  }
  const pick = (list: FlightInfo[]): FlightInfo | null =>
    list.length === 0 ? null : (list.find((f) => f.reg) ?? list[0]);
  return (
    pick(pool.filter((f) => f.departure.iata === dep && f.arrival.iata === arr)) ??
    pick(pool.filter((f) => f.departure.iata === dep)) ??
    pick(pool)
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

// The fields needed to record/identify a duty's tail (route only).
type RecordDuty = Pick<ParsedDuty, 'date' | 'flightNumber' | 'departureAirport' | 'arrivalAirport'>;
// Adds the times needed to order legs within a same-day rotation.
type RegDuty = RecordDuty & Pick<ParsedDuty, 'departureTime' | 'arrivalTime'>;

// Record (or update) the registration flown on a duty. No-op without a reg/flight number.
export async function recordReg(
  userId: string, duty: RecordDuty, leg: FlightInfo,
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

// Record (or update) a registration from a raw value rather than an AeroDataBox leg — e.g. the
// tail scraped from the FLIC board. Same store/key as recordReg, so it shows in the day view and
// the logbook and dedupes by date+flight+route.
export async function recordRegValue(
  userId: string, duty: RecordDuty, reg: string, model: string | null = null,
): Promise<AircraftReg | null> {
  if (!reg || !duty.flightNumber) return null;
  const entry: AircraftReg = {
    key: regKey(userId, duty.date, duty.flightNumber, duty.departureAirport, duty.arrivalAirport),
    userId,
    date: duty.date,
    flightNumber: duty.flightNumber,
    dep: duty.departureAirport,
    arr: duty.arrivalAirport,
    reg,
    model,
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

// A resolved registration for a leg: either captured from the API, or inferred from a
// sibling leg of the same same-day rotation (same airframe).
export interface RegLookup { reg: string; inferred: boolean }

// Same-day continuous rotation: legs sorted by departure time where each leg's arrival
// airport feeds the next leg's departure (e.g. LIS→GVA→LIS). The whole chain is flown by
// one airframe, so a tail captured on any leg applies to the rest.
export function rotationChains(legs: RegDuty[]): RegDuty[][] {
  const byDate = new Map<string, RegDuty[]>();
  for (const d of legs) {
    const list = byDate.get(d.date) ?? [];
    list.push(d);
    byDate.set(d.date, list);
  }
  const chains: RegDuty[][] = [];
  for (const list of byDate.values()) {
    list.sort((a, b) => (a.departureTime ?? '').localeCompare(b.departureTime ?? ''));
    let chain: RegDuty[] = [];
    for (const leg of list) {
      const prev = chain[chain.length - 1];
      // Continue the chain only when the aircraft flows straight on: same airport AND a
      // turnaround short enough to be the same airframe. Use full UTC instants (not bare
      // HH:mm) so the gap is SIGNED — a genuine overlap reads as a small negative, not a
      // ~23h wrap that would wrongly break the chain.
      const gapMin = prev && prev.arrivalTime && leg.departureTime
        ? (utcDateTime(leg.date, leg.departureTime).getTime()
           - utcDateTime(prev.date, prev.arrivalTime).getTime()) / 60000
        : null;
      const connects =
        prev && prev.arrivalAirport && prev.arrivalAirport === leg.departureAirport &&
        gapMin !== null && gapMin >= -15 && gapMin <= MAX_TURNAROUND_MIN;
      if (connects) {
        chain.push(leg);
      } else {
        if (chain.length) chains.push(chain);
        chain = [leg];
      }
    }
    if (chain.length) chains.push(chain);
  }
  return chains;
}

// Resolve a registration for every operated leg: confirmed tails from `confirmed`, plus
// tails inferred across same-day rotation chains (one captured leg fills its siblings).
// Inferred entries are flagged so the UI/logbook can mark them as "assumed same airframe".
export function resolveRegs(
  duties: ParsedDuty[], confirmed: Map<string, AircraftReg>,
): Map<string, RegLookup> {
  const out = new Map<string, RegLookup>();
  const legs = operatedFlights(duties).filter((d) => d.flightNumber) as RegDuty[];
  const keyOf = (d: RegDuty) => regMapKey(d.date, d.flightNumber!, d.departureAirport, d.arrivalAirport);

  for (const d of legs) {
    const hit = confirmed.get(keyOf(d));
    if (hit) out.set(keyOf(d), { reg: hit.reg, inferred: false });
  }
  for (const chain of rotationChains(legs)) {
    const known = chain.map((l) => confirmed.get(keyOf(l))).find(Boolean);
    if (!known) continue;
    for (const l of chain) {
      const k = keyOf(l);
      if (!out.has(k)) out.set(k, { reg: known.reg, inferred: true });
    }
  }
  return out;
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
// so they can judge the cost against the 100 req/month free-tier allowance. Thanks to
// rotation inference, only ONE leg per same-day chain needs a call (the siblings share
// the airframe), so this counts chains still missing a confirmed tail, not raw legs.
export async function pendingBackfillCount(userId: string, duties: ParsedDuty[]): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const confirmed = await regMap(userId);
  const keyOf = (d: RegDuty) => regMapKey(d.date, d.flightNumber!, d.departureAirport, d.arrivalAirport);
  const legs = operatedFlights(duties).filter((d) => d.flightNumber && d.date <= today) as RegDuty[];
  return rotationChains(legs).filter((chain) => !chain.some((l) => confirmed.has(keyOf(l)))).length;
}

// Look up and store registrations for operated sectors that don't have one yet, up to
// today (AeroDataBox only has data for past/near flights). Sequential and throttled to
// respect the 1 req/s limit; stops cleanly on quota/auth failure or cancel. Optimised:
// once any leg of a same-day rotation is captured, its siblings are inferred (same
// airframe) and skipped, so a LIS→GVA→LIS day costs a single API call.
export async function backfillRegs(
  userId: string,
  duties: ParsedDuty[],
  onProgress?: (p: BackfillProgress) => void,
  shouldStop?: () => boolean,
): Promise<BackfillResult> {
  const today = new Date().toISOString().slice(0, 10);
  const confirmed = await regMap(userId);
  const keyOf = (d: RegDuty) => regMapKey(d.date, d.flightNumber!, d.departureAirport, d.arrivalAirport);
  const pending = operatedFlights(duties).filter(
    (d) => d.flightNumber && d.date <= today && !confirmed.has(keyOf(d)),
  );

  let found = 0;
  let emptyCount = 0;
  let lastError: string | undefined;
  let called = 0;
  for (let i = 0; i < pending.length; i++) {
    if (shouldStop?.()) return { found, processed: i, total: pending.length, stopped: 'cancelled', emptyCount, lastError };
    const d = pending[i];
    // A sibling leg captured earlier this run already gives us this tail → no API call.
    if (resolveRegs(duties, confirmed).has(keyOf(d))) {
      onProgress?.({ done: i + 1, total: pending.length, found });
      continue;
    }
    // Free tier: 1 req/s — space out actual calls (skipped legs don't count).
    if (called > 0) await new Promise((res) => setTimeout(res, 1100));
    called++;
    const r = await fetchFlightInfo(d.flightNumber!, d.date);
    if (!r.configured) return { found, processed: i, total: pending.length, stopped: 'not_configured', emptyCount, lastError };
    if (r.error) lastError = r.error;
    // Quota or auth problems won't fix themselves on the next call — stop and report.
    if (/_429$/.test(r.error ?? '')) return { found, processed: i, total: pending.length, stopped: 'quota', emptyCount, lastError };
    if (/_40[13]$/.test(r.error ?? '')) return { found, processed: i, total: pending.length, stopped: 'auth', emptyCount, lastError };
    const leg = matchLeg(r.flights, d.departureAirport, d.arrivalAirport, d.date);
    if (leg?.reg) {
      const saved = await recordReg(userId, d, leg);
      if (saved) confirmed.set(keyOf(d), saved); // so the sibling skips its call
      found++;
    } else if (r.flights.length === 0) emptyCount++;
    onProgress?.({ done: i + 1, total: pending.length, found });
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
