// Live aircraft position by registration, for "where is the aircraft I'm about to fly, if it's
// still in the air?". The Cloudflare worker (POST /api/acpos) queries free, keyless ADS-B feeds
// server-side (they send no CORS headers) and returns a position only while the aircraft is
// actually airborne and being received — otherwise tracked:false. Like FLIC, it's only meaningful
// on the day of the flight, when the inbound aircraft is en route to operate your leg.

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

export interface AircraftPosition {
  reg: string;
  hex: string | null;
  flight: string | null; // current callsign of the aircraft's live flight
  lat: number;
  lon: number;
  track: number | null; // heading, degrees
  altFt: number | null;
  gsKt: number | null; // ground speed, knots
  baroRate: number | null; // vertical rate, ft/min (+climb / −descent)
  onGround: boolean;
  seenSec: number | null; // how many seconds ago the position was received
  source: string | null;
}

// The feature only works with a worker configured (the ADS-B feeds have no CORS). When VITE_API_URL
// is unset at build time, API_BASE is undefined and Rollup eliminates the fetch path.
export function aircraftTrackingEnabled(): boolean {
  return !!API_BASE;
}

const TTL_MS = 20_000;
const cache = new Map<string, { ts: number; promise: Promise<AircraftPosition | null> }>();

// Fetch the live position for a registration. Returns null when the aircraft isn't currently
// tracked (on the ground / out of coverage / not flying) or the feature is off. Short-cached so
// several components asking at once collapse to one request; force bypasses it (manual refresh).
export async function fetchAircraftPosition(
  reg: string | null | undefined,
  opts: { force?: boolean } = {},
): Promise<AircraftPosition | null> {
  const r = (reg || '').trim().toUpperCase();
  if (!API_BASE || !r) return null;

  const hit = cache.get(r);
  if (!opts.force && hit && Date.now() - hit.ts < TTL_MS) return hit.promise;

  const promise = (async (): Promise<AircraftPosition | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/acpos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reg: r }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { tracked?: boolean } & Partial<AircraftPosition>;
      if (!data.tracked || typeof data.lat !== 'number' || typeof data.lon !== 'number') return null;
      return {
        reg: data.reg || r,
        hex: data.hex ?? null,
        flight: data.flight ?? null,
        lat: data.lat,
        lon: data.lon,
        track: typeof data.track === 'number' ? data.track : null,
        altFt: typeof data.altFt === 'number' ? data.altFt : null,
        gsKt: typeof data.gsKt === 'number' ? data.gsKt : null,
        baroRate: typeof data.baroRate === 'number' ? data.baroRate : null,
        onGround: !!data.onGround,
        seenSec: typeof data.seenSec === 'number' ? data.seenSec : null,
        source: data.source ?? null,
      };
    } catch {
      return null;
    }
  })();

  cache.set(r, { ts: Date.now(), promise });
  // Don't cache a null/failed result — drop it so the next call retries.
  promise.then((d) => { if (d == null) cache.delete(r); }).catch(() => cache.delete(r));
  return promise;
}
