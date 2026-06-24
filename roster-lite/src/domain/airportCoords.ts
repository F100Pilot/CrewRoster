import { AIRPORT_COORD, type Coord } from './airports';
import fallbackData from './airportCoordsFallback.json';

// Comprehensive worldwide IATA → [lat, lon] table (OurAirports), used as a fallback so any
// scheduled airport resolves even when it's outside the curated PGA/TAP network. Bundled with
// the (lazy-loaded) map so it doesn't weigh on the app shell.
const FALLBACK: Record<string, number[]> = fallbackData;

// Coordinates for an airport by IATA code. The curated AIRPORT_COORD wins (accurate and the
// authoritative source for the network); otherwise the worldwide fallback is consulted, so a
// new/out-of-network destination is still placed on the map instead of being silently dropped.
export function airportCoord(code: string | null | undefined): Coord | null {
  if (!code) return null;
  const c = code.toUpperCase();
  if (AIRPORT_COORD[c]) return AIRPORT_COORD[c];
  const f = FALLBACK[c];
  return f ? { lat: f[0], lon: f[1] } : null;
}
